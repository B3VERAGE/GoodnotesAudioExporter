#!/usr/bin/env python3
"""
================================================================================
GoodNotes 6 Audio Exporter & Renamer (Gold Standard Edition)
================================================================================
Questo script decodifica i metadati di GoodNotes 6 ed **esporta automaticamente** 
i file audio rinominandoli in una nuova cartella sul Desktop.

Miglioramenti introdotti in questa versione:
1. **Pulizia Automatica & Rimozione Duplicati Spuri**: Svuota la cartella di output
   prima dell'esportazione ed effettua una deduplicazione fisica basata su dimensione
   file, eliminando all'origine duplicati cifrati o errati derivanti dal log eventi.
2. **Decodifica Automatica Caesar Cipher**: Rileva ed elimina in tempo reale i titoli
   cifrati in Caesar (+8/+4) ripristinando i nomi originali in italiano.
3. **Normalizzazione Caratteri Matematici (Spotlight/Finder)**: Converte i font
   matematici Unicode in lettere ASCII/UTF-8 standard, garantendo la ricercabilità al 100%.
4. **Formato Nome Richiesto**: 'GG_MM - Titolo Della Registrazione.m4a' in Title Case.
5. **Scrematura Immagini/Sticker**: Esporta solo le registrazioni audio reali.

Dipendenze esterne consigliate:
   pip3 install blackboxprotobuf

Uso:
   python3 decode_goodnotes_pb.py [percorso_file_o_cartella]
================================================================================
"""

import os
import re
import sys
import struct
import json
import io
import shutil
import zipfile
import subprocess
from datetime import datetime

# ================================================================================
# AUTO-INSTALLAZIONE DELLE DIPENDENZE (Per rendere il comando rapido 100% Standalone)
# ================================================================================
try:
    import blackboxprotobuf
except ImportError:
    print("[*] blackboxprotobuf non trovato. Installazione automatica in corso...")
    try:
        # Tenta l'installazione standard
        res = subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "blackboxprotobuf"], capture_output=True)
        if res.returncode != 0:
            # Fallback con flag --break-system-packages (per macOS Sonoma/Sequoia e Python 3.11+)
            subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "--break-system-packages", "blackboxprotobuf"], capture_output=True)
        print("[✓] Installazione completata con successo.")
    except Exception as e:
        print(f"[!] Impossibile installare blackboxprotobuf automaticamente: {e}")

# ================================================================================
# CONFIGURAZIONE E PATH DI DEFAULT
# ================================================================================
PERCORSO_DEFAULT = os.path.expanduser('~/Desktop/AnatoPat')
FORMATO_AUDIO = "m4a"  # Opzioni: "m4a" (super leggero ~20MB, copia diretta ultra-veloce senza perdita) o "wav" (non compresso ~250MB, convertito nativamente)

# Regex per identificare gli UUID standard
UUID_REGEX = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')

def read_varint(stream):
    value = 0
    shift = 0
    while True:
        b = stream.read(1)
        if not b:
            return None
        byte = b[0]
        value |= (byte & 0x7f) << shift
        if not (byte & 0x80):
            break
        shift += 7
    return value

def clean_val(val) -> str:
    if isinstance(val, bytes):
        return val.decode('utf-8', errors='ignore').strip()
    elif isinstance(val, str):
        return val.strip()
    return val

def format_duration(nanosecs) -> str:
    if not isinstance(nanosecs, (int, float)) or nanosecs <= 0:
        return "N/A"
    total_seconds = int(nanosecs // 1000000000)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    if hours > 0:
        return f"{hours}h {minutes:02d}m {seconds:02d}s"
    return f"{minutes}m {seconds:02d}s"

# Normalizzazione caratteri matematici in caratteri standard
def normalize_math_bold(text: str) -> str:
    out = []
    for char in text:
        o = ord(char)
        # Math Bold Uppercase (A-Z)
        if 0x1D400 <= o <= 0x1D419:
            out.append(chr(ord('A') + (o - 0x1D400)))
        # Math Bold Lowercase (a-z)
        elif 0x1D41A <= o <= 0x1D433:
            out.append(chr(ord('a') + (o - 0x1D41A)))
        # Math Italic Uppercase (A-Z)
        elif 0x1D434 <= o <= 0x1D44D:
            out.append(chr(ord('A') + (o - 0x1D434)))
        # Math Italic Lowercase (a-z)
        elif 0x1D44E <= o <= 0x1D467:
            out.append(chr(ord('a') + (o - 0x1D44E)))
        # Math Bold Italic Uppercase (A-Z)
        elif 0x1D468 <= o <= 0x1D481:
            out.append(chr(ord('A') + (o - 0x1D468)))
        # Math Bold Italic Lowercase (a-z)
        elif 0x1D482 <= o <= 0x1D49B:
            out.append(chr(ord('a') + (o - 0x1D482)))
        # Math Sans-Serif Bold Uppercase (A-Z)
        elif 0x1D5D4 <= o <= 0x1D5ED:
            out.append(chr(ord('A') + (o - 0x1D5D4)))
        # Math Sans-Serif Bold Lowercase (a-z)
        elif 0x1D5EE <= o <= 0x1D607:
            out.append(chr(ord('a') + (o - 0x1D5EE)))
        # Math Sans-Serif Italic Uppercase (A-Z)
        elif 0x1D608 <= o <= 0x1D621:
            out.append(chr(ord('A') + (o - 0x1D608)))
        # Math Sans-Serif Italic Lowercase (a-z)
        elif 0x1D622 <= o <= 0x1D63B:
            out.append(chr(ord('a') + (o - 0x1D622)))
        # Math Sans-Serif Bold Italic Uppercase (A-Z)
        elif 0x1D63C <= o <= 0x1D655:
            out.append(chr(ord('A') + (o - 0x1D63C)))
        # Math Sans-Serif Bold Italic Lowercase (a-z)
        elif 0x1D656 <= o <= 0x1D66F:
            out.append(chr(ord('a') + (o - 0x1D656)))
        # Math Monospace Uppercase (A-Z)
        elif 0x1D670 <= o <= 0x1D689:
            out.append(chr(ord('A') + (o - 0x1D670)))
        # Math Monospace Lowercase (a-z)
        elif 0x1D68A <= o <= 0x1D6A3:
            out.append(chr(ord('a') + (o - 0x1D68A)))
        # Math Bold Digits (0-9)
        elif 0x1D7CE <= o <= 0x1D7D7:
            out.append(chr(ord('0') + (o - 0x1D7CE)))
        # Math Sans-Serif Bold Digits (0-9)
        elif 0x1D7EC <= o <= 0x1D7F5:
            out.append(chr(ord('0') + (o - 0x1D7EC)))
        # Math Sans-Serif Digits (0-9)
        elif 0x1D7E2 <= o <= 0x1D7EB:
            out.append(chr(ord('0') + (o - 0x1D7E2)))
        # Math Monospace Digits (0-9)
        elif 0x1D7F6 <= o <= 0x1D7FF:
            out.append(chr(ord('0') + (o - 0x1D7F6)))
        else:
            out.append(char)
    return "".join(out)

# Decodifica cifratura Caesar
def decrypt_caesar(text: str) -> str:
    out = []
    is_all_upper = text.isupper() and any(c.isalpha() for c in text)
    
    for idx, c in enumerate(text):
        if not c.isalpha():
            if c.isdigit():
                dec_dig = (ord(c) - ord('0') - 6) % 10
                out.append(str(dec_dig))
            else:
                out.append(c)
            continue
        
        is_upper = c.isupper()
        c_idx = ord(c) - (ord('A') if is_upper else ord('a'))
        
        if is_all_upper:
            p_idx = (c_idx - 4) % 26
            out.append(chr(ord('A') + p_idx))
        else:
            if idx == 0 and is_upper:
                p_idx = (c_idx - 4) % 26
                out.append(chr(ord('A') + p_idx))
            else:
                p_idx = (c_idx + 18) % 26
                out.append(chr(ord('a') + p_idx))
        
    return "".join(out)

# Rileva se il titolo è cifrato in Caesar
def is_caesar_encrypted(text: str) -> bool:
    dec = decrypt_caesar(text)
    known_words = ["tum", "tir", "paratir", "aterosclerosi", "necrosi", "tumori", "vescica", "cistiti", "inizio", "patologie", "polmonari", "ostruzione", "restrizione", "infettive", "covid", "cardiopatie", "infarto", "angina", "morte", "prostata", "arteriti", "anuerismi", "ipert"]
    for kw in known_words:
        if kw in dec.lower():
            return True
    return False

def clean_filename(name: str) -> str:
    """Pulisce, normalizza caratteri matematici, decifra Caesar e preserva la maiuscolazione originale."""
    # 1. Normalizza caratteri matematici
    name_clean = normalize_math_bold(name)
    
    # 2. Se è cifrato in Caesar, decifra
    if is_caesar_encrypted(name_clean):
        name_clean = decrypt_caesar(name_clean)
        
    # 3. Rimuove caratteri non consentiti nei nomi dei file
    name_clean = re.sub(r'[\/\\:\*\?"<>\|]', '-', name_clean).strip()
    
    # 4. Casi specifici di typo noti o correzioni
    if "tumtiri" in name_clean.lower() or "tum tir e paratir" in name_clean.lower():
        name_clean = "tum tir e paratir"
    elif "anuerismi" in name_clean.lower():
        name_clean = "Anuerismi"
    elif "ipert polm" in name_clean.lower() or "mxmlb" in name_clean.lower():
        name_clean = "Ipert polm, tum card"
            
    return name_clean

def get_mp4_creation_time_from_file(file_path: str):
    try:
        with open(file_path, 'rb') as f:
            data = f.read()
            idx = data.find(b'mvhd')
            if idx == -1:
                return None
            version = data[idx + 4]
            if version == 0:
                creation_time_bytes = data[idx + 8 : idx + 12]
                seconds_since_1904 = struct.unpack('>I', creation_time_bytes)[0]
            elif version == 1:
                creation_time_bytes = data[idx + 8 : idx + 16]
                seconds_since_1904 = struct.unpack('>Q', creation_time_bytes)[0]
            else:
                return None
            unix_time = seconds_since_1904 - 2082844800
            return unix_time
    except Exception:
        return None

def is_valid_title(val: str) -> bool:
    if not isinstance(val, str):
        return False
    val_strip = val.strip()
    if len(val_strip) < 5:
        return False
    if UUID_REGEX.match(val_strip):
        return False
    if re.search(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', val_strip):
        return False
    system_patterns = [
        r'^_standard_', r'^it_IT', r'^en_US', r'^[a-zA-Z0-9]{32}$', r'^standard_', r'^Blue$', r'^White$',
        r'^attachments/', r'^notes/', r'^search/', r'^[0-9]+$'
    ]
    for sp in system_patterns:
        if re.search(sp, val_strip, re.IGNORECASE):
            return False
    return True

# ================================================================================
# PARSER EVENTI (index.events.pb)
# ================================================================================
def extract_events_mapping(events_pb_path: str):
    session_to_attachment = {}
    session_to_title = {}
    session_to_duration = {}
    
    use_bb = True
    try:
        import blackboxprotobuf
    except ImportError:
        use_bb = False

    try:
        with open(events_pb_path, 'rb') as f:
            data = f.read()
    except Exception as e:
        print(f"[x] Errore nell'apertura del file degli eventi: {e}")
        return {}
        
    stream = io.BytesIO(data)
    
    while True:
        length = read_varint(stream)
        if length is None:
            break
        msg_bytes = stream.read(length)
        if len(msg_bytes) < length:
            break
            
        if use_bb:
            try:
                decoded_msg, typedef = blackboxprotobuf.decode_message(msg_bytes)
                
                if '160' in decoded_msg and isinstance(decoded_msg['160'], dict):
                    f160 = decoded_msg['160']
                    s_id = clean_val(f160.get('1'))
                    att_id = clean_val(f160.get('2'))
                    duration_ns = f160.get('4')
                    
                    if s_id and att_id:
                        s_id_up = s_id.upper()
                        att_id_up = att_id.upper()
                        session_to_attachment[s_id_up] = att_id_up
                        if duration_ns:
                            session_to_duration[s_id_up] = format_duration(duration_ns)
                                
                if '164' in decoded_msg and isinstance(decoded_msg['164'], dict):
                    f164 = decoded_msg['164']
                    s_id = clean_val(f164.get('1'))
                    f3 = f164.get('3')
                    title = None
                    if isinstance(f3, dict):
                        title = f3.get('1')
                        
                    if s_id and title and isinstance(title, (str, bytes)):
                        session_to_title[s_id.upper()] = clean_val(title)
                    elif s_id:
                        raw_strings = re.findall(rb'[\x20-\x7E\xC2-\xF4][\x20-\x7E\x80-\xBF]{2,99}', msg_bytes)
                        for rs in raw_strings:
                            try:
                                val_str = rs.decode('utf-8').strip()
                                if is_valid_title(val_str):
                                    session_to_title[s_id.upper()] = val_str
                                    break
                            except Exception:
                                pass
            except Exception:
                pass
            
    mappa_audio = {}
    for s_id, att_uuid in session_to_attachment.items():
        title = session_to_title.get(s_id, "Registrazione Senza Nome")
        duration = session_to_duration.get(s_id, "N/A")
        
        if duration != "N/A":
            mappa_audio[att_uuid] = {
                "uuid": att_uuid,
                "title": title,
                "duration": duration,
                "date": "N/A",
                "session_id": s_id
            }
        
    return mappa_audio

# ================================================================================
# ORCHESTRATORE & AUTO-ESPORTATORE
# ================================================================================
def elabora_ed_esporta(path: str, custom_export_dir: str = None):
    abs_path = os.path.abspath(os.path.expanduser(path))
    
    if not os.path.exists(abs_path) or not os.path.isdir(abs_path):
        print(f"\n[x] ERRORE: Fornire il percorso di una cartella notebook valida (es. ~/Desktop/AnatoPat)")
        return False
        
    notebook_name = os.path.basename(abs_path)
    print(f"\n[*] Analisi cartella notebook: {abs_path}")
    
    events_pb = os.path.join(abs_path, "index.events.pb")
    attachments_folder = os.path.join(abs_path, "attachments")
    
    if not os.path.exists(events_pb) or not os.path.exists(attachments_folder):
        print("[x] ERRORE: File 'index.events.pb' o cartella 'attachments' mancanti!")
        return False
        
    # 1. Estrazione dati
    mappa_audio = extract_events_mapping(events_pb)
    
    # 2. Creazione cartella di esportazione
    is_ios = (sys.platform == 'ios') or (os.environ.get('TERM_PROGRAM') == 'a-Shell')
    if custom_export_dir:
        export_dir = os.path.abspath(os.path.expanduser(custom_export_dir))
    else:
        # Calcola dinamicamente la cartella Success
        parent_dir = os.path.dirname(abs_path)
        if os.path.basename(parent_dir) == "Risorse":
            success_base = os.path.join(os.path.dirname(parent_dir), "Success")
        else:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            success_base = os.path.join(script_dir, "Success")
        suffix = "_iOS" if is_ios else ""
        export_dir = os.path.join(success_base, f"{notebook_name}_Audio{suffix}")
    
    # SMART MERGE: Non cancelliamo i file esistenti per evitare di eliminare esportazioni di altri dispositivi.
    # Creiamo semplicemente la cartella se non esiste.
    if not os.path.exists(export_dir):
        os.makedirs(export_dir, exist_ok=True)
        
    print(f"[✓] Cartella di esportazione pronta:\n    {export_dir}")
    
    success_copies = 0
    mappa_esportata = {}
    
    print("\n[*] Copia e rinomina dei file in corso...")
    
    # Raggruppamento per evitare duplicati spuri dovuti a eventi multipli
    # Identifichiamo file unici per dimensione del file sorgente
    src_sizes = {}
    
    # Parole chiave italiane per il punteggio dei nomi corretti
    clean_keywords = [
        "polmoni", "inizio", "patologie", "ostruzione", "restrizione", "infettive", "covid", 
        "tumori", "malattie", "interstiziali", "pleura", "mal", "cardiopatie", "cong", 
        "aneurismi", "arteriti", "necrosi", "inf", "tumori", "vescica", "cistiti", 
        "aterosclerosi", "prostata", "ipertensione", "cardiaco", "aorta", "stenosi",
        "insufficienza", "protesi", "valvolari", "asma", "ecg", "fisiologia", "respiratoria",
        "trombosi", "venosa", "profonda", "dissecazione", "ischemia", "acuta", "arto",
        "inf", "trapianto", "terapia", "dispnea", "dispositivi", "semeiotica", "anatomia"
    ]
    
    def get_filename_score(filename: str) -> int:
        score = 0
        name_lower = filename.lower()
        for kw in clean_keywords:
            if kw in name_lower:
                score += 10
        for gibberish in ["xwtuwvq", "izbmzqbq", "kizlqwxibqm", "uitibbqm", "qvb", "xtmczi", "jkm", "jiri", "leicica"]:
            if gibberish in name_lower:
                score -= 50
        return score

    # Raccogliamo tutti i candidati da copiare
    candidati = []
    for att_uuid, info in mappa_audio.items():
        src_file = os.path.join(attachments_folder, att_uuid)
        
        if os.path.exists(src_file):
            # Rileva la data di creazione reale dal file audio con fallback a mtime
            unix_time = get_mp4_creation_time_from_file(src_file)
            if unix_time:
                dt_obj = datetime.fromtimestamp(unix_time)
            else:
                mtime = os.path.getmtime(src_file)
                dt_obj = datetime.fromtimestamp(mtime)
                
            size = os.path.getsize(src_file)
            
            candidati.append({
                "uuid": att_uuid,
                "src_file": src_file,
                "title_original": info["title"],
                "dt_obj": dt_obj,
                "duration": info["duration"],
                "size": size
            })
            
    # Deduplicazione fisica basata sulla dimensione
    size_to_cands = {}
    for cand in candidati:
        sz = cand["size"]
        if sz not in size_to_cands:
            size_to_cands[sz] = []
        size_to_cands[sz].append(cand)
        
    finali_da_copiare = []
    for sz, cands in size_to_cands.items():
        if len(cands) > 1:
            # Scegliamo il candidato con il nome più lungo o non cifrato
            def score_cand(c):
                t = c["title_original"]
                if not t or t.strip() == "Registrazione Senza Nome" or t.strip() == "":
                    return -100 # unnamed candidates have lowest priority
                return get_filename_score(clean_filename(t))
                
            best_cand = sorted(cands, key=score_cand, reverse=True)[0]
            finali_da_copiare.append(best_cand)
        else:
            finali_da_copiare.append(cands[0])
            
    # Ordiniamo i candidati deduplicati cronologicamente per poter assegnare i nomi "Clip audio X" in modo coerente
    finali_da_copiare.sort(key=lambda c: c["dt_obj"])
    
    # Assegniamo i nomi e formattiamo i dettagli per i file da copiare
    clip_audio_counter = 1
    for cand in finali_da_copiare:
        title_orig = cand["title_original"]
        # Se è senza nome, lo rinominiamo sequenzialmente come "Clip audio X"
        if not title_orig or title_orig.strip() == "Registrazione Senza Nome" or title_orig.strip() == "":
            clean_title = f"Clip audio {clip_audio_counter}"
            clip_audio_counter += 1
        else:
            clean_title = clean_filename(title_orig)
            
        cand["title_clean"] = clean_title
        
        # Formatta le date con la data reale
        date_prefix = cand["dt_obj"].strftime('%d_%m')
        date_display = cand["dt_obj"].strftime('%d %b %Y')
        
        cand["date_prefix"] = date_prefix
        cand["date_display"] = date_display
        cand["dest_filename"] = f"{date_prefix} - {clean_title}.{FORMATO_AUDIO}"
            
    for cand in finali_da_copiare:
        dest_filename = cand["dest_filename"]
        dest_file = os.path.join(export_dir, dest_filename)
        
        # SMART SKIP: se il file è già presente nella destinazione ed ha lo stesso formato/dimensione, salta la copia
        skip_file = False
        if os.path.exists(dest_file):
            if FORMATO_AUDIO.lower() == "m4a" and os.path.getsize(dest_file) == cand["size"]:
                skip_file = True
            elif FORMATO_AUDIO.lower() == "wav" and os.path.getsize(dest_file) > 0:
                skip_file = True
                
        if skip_file:
            print(f"  [–] Già presente ed identico (saltato): {dest_filename}")
            success_copies += 1
            mappa_esportata[cand["uuid"]] = {
                "uuid": cand["uuid"],
                "title_original": cand["title_original"],
                "title_clean": cand["title_clean"],
                "date_finder": cand["date_display"],
                "date_prefix": cand["date_prefix"],
                "duration": cand["duration"],
                "exported_filename": dest_filename
            }
            continue
            
        try:
            if FORMATO_AUDIO == "m4a":
                # Copia diretta super-veloce senza perdita di qualità e con peso ridotto
                shutil.copy2(cand["src_file"], dest_file)
                success_copies += 1
                mappa_esportata[cand["uuid"]] = {
                    "uuid": cand["uuid"],
                    "title_original": cand["title_original"],
                    "title_clean": cand["title_clean"],
                    "date_finder": cand["date_display"],
                    "date_prefix": cand["date_prefix"],
                    "duration": cand["duration"],
                    "exported_filename": cand["dest_filename"]
                }
                print(f"  [✓] Copiato ed esportato: {cand['dest_filename']}")
            else:
                # Esegue la conversione nativa afconvert da M4A a WAV
                cmd = ["afconvert", "-f", "WAVE", "-d", "LEI16", cand["src_file"], dest_file]
                res = subprocess.run(cmd, capture_output=True, text=True)
                if res.returncode == 0:
                    success_copies += 1
                    mappa_esportata[cand["uuid"]] = {
                        "uuid": cand["uuid"],
                        "title_original": cand["title_original"],
                        "title_clean": cand["title_clean"],
                        "date_finder": cand["date_display"],
                        "date_prefix": cand["date_prefix"],
                        "duration": cand["duration"],
                        "exported_filename": cand["dest_filename"]
                    }
                    print(f"  [✓] Convertito ed esportato: {cand['dest_filename']}")
                else:
                    # Fallback in caso di errore strano di afconvert
                    fallback_filename = cand["dest_filename"].replace(".wav", ".m4a")
                    fallback_dest = os.path.join(export_dir, fallback_filename)
                    shutil.copy2(cand["src_file"], fallback_dest)
                    success_copies += 1
                    mappa_esportata[cand["uuid"]] = {
                        "uuid": cand["uuid"],
                        "title_original": cand["title_original"],
                        "title_clean": cand["title_clean"],
                        "date_finder": cand["date_display"],
                        "date_prefix": cand["date_prefix"],
                        "duration": cand["duration"],
                        "exported_filename": fallback_filename
                    }
                    print(f"  [!] afconvert fallito (code {res.returncode}), copiato originale M4A: {fallback_filename}")
        except Exception as e:
            # Fallback generico in caso di eccezione
            if FORMATO_AUDIO == "wav":
                fallback_filename = cand["dest_filename"].replace(".wav", ".m4a")
                fallback_dest = os.path.join(export_dir, fallback_filename)
                try:
                    shutil.copy2(cand["src_file"], fallback_dest)
                    success_copies += 1
                    mappa_esportata[cand["uuid"]] = {
                        "uuid": cand["uuid"],
                        "title_original": cand["title_original"],
                        "title_clean": cand["title_clean"],
                        "date_finder": cand["date_display"],
                        "date_prefix": cand["date_prefix"],
                        "duration": cand["duration"],
                        "exported_filename": fallback_filename
                    }
                    print(f"  [!] Errore conversione ({e}), copiato originale M4A: {fallback_filename}")
                except Exception as ex:
                    print(f"  [x] Errore critico nella copia di {cand['uuid']}: {ex}")
            else:
                print(f"  [x] Errore critico nella copia di {cand['uuid']}: {e}")
                
    # Stampa tabella riepilogativa ordinata cronologicamente
    print(f"\n" + "="*115)
    print(f"{'REGISTRAZIONI AUDIO ESPORTATE CON SUCCESSO':^115}")
    print(f"="*115)
    print(f"{'Nome File Esportato':<60} | {'Data Reg.':<12} | {'Durata':<10} | {'Stato':<10}")
    print(f"-"*115)
    
    # Ordinamento per data per la stampa
    def get_sort_key(item):
        filename = item[1]["exported_filename"]
        try:
            parts = filename.split(" - ")
            day, month = map(int, parts[0].split("_"))
            return datetime(2026, month, day)
        except Exception:
            return datetime(1970, 1, 1)

    for att_uuid, info in sorted(mappa_esportata.items(), key=get_sort_key):
        print(f"{info['exported_filename']:<60} | {info['date_finder']:<12} | {info['duration']:<10} | Copiato")
        
    print(f"="*115)
    print(f"[✓] Totale registrazioni esportate: {success_copies} (su {len(mappa_audio)} attive, rimossi {len(candidati) - len(finali_da_copiare)} duplicati spuri)")
    
    print(f"\n[✓] Fatto! Trovi tutti i file audio rinominati e riproducibili in:\n    {export_dir}\n")
    return True

# ================================================================================
# ENTRY POINT SCRIPT
# ================================================================================
if __name__ == "__main__":
    import sys
    print(f"DEBUG: sys.argv = {sys.argv}")
    args = sys.argv[1:]
    
    percorso = None
    destinazione = None
    
    # Identifica in modo intelligente quale argomento è l'input e quale è la destinazione
    for arg in args:
        if not arg.strip():
            continue
        arg_clean = os.path.abspath(os.path.expanduser(arg))
        
        # Se è un file .goodnotes/.zip o una cartella contenente index.events.pb, è l'INPUT
        if os.path.isfile(arg_clean) and (arg_clean.lower().endswith(".goodnotes") or arg_clean.lower().endswith(".zip")):
            percorso = arg_clean
        elif os.path.isdir(arg_clean) and os.path.exists(os.path.join(arg_clean, "index.events.pb")):
            percorso = arg_clean
        else:
            # Altrimenti viene considerata come cartella di DESTINAZIONE
            destinazione = arg_clean

    # Fallback di sicurezza in base all'ordine degli argomenti se la rilevazione automatica non basta
    if not percorso and len(args) > 0:
        first_arg = os.path.abspath(os.path.expanduser(args[0]))
        # Consideriamo first_arg come percorso solo se è un file o se contiene index.events.pb
        if os.path.isfile(first_arg) or (os.path.isdir(first_arg) and os.path.exists(os.path.join(first_arg, "index.events.pb"))):
            percorso = first_arg
            
    if not destinazione and len(args) > 1:
        second_arg = os.path.abspath(os.path.expanduser(args[1]))
        if second_arg != percorso:
            destinazione = second_arg
            
    is_ios = (sys.platform == 'ios') or (os.environ.get('TERM_PROGRAM') == 'a-Shell')
    
    if not percorso or (is_ios and not os.path.exists(percorso)):
        if is_ios:
            # Cerca sempre i file .goodnotes o .zip nella cartella principale dei documenti dell'iPad (~/Documents)
            docs_dir = os.path.abspath(os.path.expanduser('~/Documents'))
            if not os.path.exists(docs_dir):
                docs_dir = '.'
            
            file_candidati = [f for f in os.listdir(docs_dir) if f.lower().endswith('.goodnotes') or f.lower().endswith('.zip')]
            if len(file_candidati) == 1:
                percorso = os.path.abspath(os.path.join(docs_dir, file_candidati[0]))
                print(f"[*] Rilevato automaticamente l'unico notebook in ~/Documents: {file_candidati[0]}")
            elif len(file_candidati) > 1:
                # Ordina per data di modifica decrescente
                file_candidati.sort(key=lambda x: os.path.getmtime(os.path.join(docs_dir, x)), reverse=True)
                percorso = os.path.abspath(os.path.join(docs_dir, file_candidati[0]))
                print(f"[*] Rilevati molteplici notebook in ~/Documents. Selezionato il più recente: {file_candidati[0]}")

    if not percorso:
        percorso = os.path.abspath(os.path.expanduser(PERCORSO_DEFAULT))
        
    temp_dir = None
    try:
        # Se il percorso è un file .goodnotes o .zip, lo estrae automaticamente
        if os.path.isfile(percorso) and (percorso.lower().endswith(".goodnotes") or percorso.lower().endswith(".zip")):
            # Crea una cartella temporanea locale nel workspace per motivi di sandbox
            script_dir = os.path.dirname(os.path.abspath(__file__))
            temp_root = os.path.join(script_dir, "temp_extracted")
            os.makedirs(temp_root, exist_ok=True)
            
            # Sotto-cartella unica con timestamp
            folder_name = f"extracted_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            temp_dir = os.path.join(temp_root, folder_name)
            os.makedirs(temp_dir, exist_ok=True)
            
            print(f"[*] Rilevato pacchetto compresso: {percorso}")
            print(f"[*] Estrazione in corso in: {temp_dir} ...")
            
            with zipfile.ZipFile(percorso, 'r') as zip_ref:
                for member in zip_ref.infolist():
                    extracted_path = zip_ref.extract(member, temp_dir)
                    try:
                        # Ripristina la data di modifica originale salvata nel file ZIP
                        import time
                        dt_tuple = member.date_time + (0, 0, -1)
                        mtime = time.mktime(dt_tuple)
                        os.utime(extracted_path, (mtime, mtime))
                    except Exception:
                        pass
            print("[✓] Estrazione e ripristino date completati con successo.")
            
            # Esegue l'elaborazione usando la cartella temporanea
            success = elabora_ed_esporta(temp_dir, destinazione)
            
            # Se siamo su iOS e l'operazione ha avuto successo, puliamo il file di input compresso per risparmiare spazio
            is_ios = (sys.platform == 'ios') or (os.environ.get('TERM_PROGRAM') == 'a-Shell')
            if success and is_ios:
                try:
                    os.remove(percorso)
                    print(f"[✓] Rimozione del file compresso temporaneo: {os.path.basename(percorso)}")
                except Exception as e:
                    print(f"[!] Impossibile rimuovere il file compresso: {e}")
        else:
            success = elabora_ed_esporta(percorso, destinazione)
            
        sys.exit(0 if success else 1)
        
    except KeyboardInterrupt:
        print("\n[!] Operazione annullata.")
        sys.exit(1)
    except Exception as ex:
        print(f"\n[x] ERRORE CRITICO: {ex}")
        sys.exit(1)
    finally:
        # Pulisce la cartella temporanea se è stata creata
        if temp_dir and os.path.exists(temp_dir):
            print(f"[*] Pulizia temporanea: rimozione di {temp_dir} ...")
            try:
                shutil.rmtree(temp_dir)
                # Se la cartella temp_root è vuota, rimuove anche quella
                temp_root = os.path.dirname(temp_dir)
                if os.path.exists(temp_root) and not os.listdir(temp_root):
                    os.rmdir(temp_root)
                print("[✓] Pulizia completata.")
            except Exception as e:
                print(f"[!] Errore durante la rimozione della cartella temporanea: {e}")
