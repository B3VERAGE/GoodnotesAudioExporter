#!/usr/bin/env python3
"""
================================================================================
Goodnotes AI Agent (Gold Standard Autonomous Edition)
================================================================================
Un agente AI autonomo basato su Google Antigravity SDK per gestire i file Goodnotes 6,
analizzare le registrazioni audio, decifrare i titoli (Caesar + Unicode Math)
ed esportarle in modo ordinato e deduplicato nella cartella Success.

Esecuzione:
   ./.venv/bin/python goodnotes_agent.py
================================================================================
"""

import os
import re
import sys
import struct
import io
import shutil
import zipfile
import subprocess
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, List

# Import dell'Antigravity SDK
try:
    from google.antigravity import Agent, LocalAgentConfig, ToolContext
except ImportError:
    print("[x] ERRORE: Google Antigravity SDK non trovato in questo ambiente Python.")
    print("    Assicurati di eseguire l'agente usando l'ambiente virtuale: ./.venv/bin/python")
    sys.exit(1)

try:
    import blackboxprotobuf
except ImportError:
    print("[*] Installazione automatica di blackboxprotobuf...")
    subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "blackboxprotobuf", "--no-deps"], check=False)
    import blackboxprotobuf

# ================================================================================
# CONFIGURAZIONE DEI PERCORSI DEL WORKSPACE
# ================================================================================
# Determina la radice reale del workspace dell'utente (anche quando compilato in .app)
if hasattr(sys, '_MEIPASS'):
    # In PyInstaller, l'eseguibile è dentro il bundle (es. Goodnotes Agent.app/Contents/MacOS/Goodnotes Agent)
    exe_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
    if ".app/Contents/MacOS" in exe_dir:
        WORKSPACE_ROOT = os.path.abspath(os.path.join(exe_dir, "../../../../"))
    else:
        WORKSPACE_ROOT = exe_dir
else:
    WORKSPACE_ROOT = os.path.dirname(os.path.abspath(__file__))

# Caricamento di dotenv dal percorso assoluto del workspace per garantire persistenza tra riavvii
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(WORKSPACE_ROOT, ".env"))
except ImportError:
    pass

RISORSE_DIR = os.path.join(WORKSPACE_ROOT, "Risorse")
SUCCESS_DIR = os.path.join(WORKSPACE_ROOT, "Success")
SCRATCH_DIR = os.path.join(WORKSPACE_ROOT, "scratch")

# Crea le cartelle necessarie se non esistono
os.makedirs(RISORSE_DIR, exist_ok=True)
os.makedirs(SUCCESS_DIR, exist_ok=True)
os.makedirs(SCRATCH_DIR, exist_ok=True)

UUID_REGEX = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')

# ================================================================================
# METODI DI SUPPORTO PER IL DECODING E LA DECRITTAZIONE (da decode_goodnotes_pb.py)
# ================================================================================

def read_varint(stream) -> Optional[int]:
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
    return str(val)

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

def is_caesar_encrypted(text: str) -> bool:
    dec = decrypt_caesar(text)
    known_words = ["tum", "tir", "paratir", "aterosclerosi", "necrosi", "tumori", "vescica", "cistiti", "inizio", "patologie", "polmonari", "ostruzione", "restrizione", "infettive", "covid", "cardiopatie", "infarto", "angina", "morte", "prostata", "arteriti", "anuerismi", "ipert"]
    for kw in known_words:
        if kw in dec.lower():
            return True
    return False

def clean_filename(name: str) -> str:
    name_clean = normalize_math_bold(name)
    if is_caesar_encrypted(name_clean):
        name_clean = decrypt_caesar(name_clean)
        
    name_clean = re.sub(r'[\/\\:\*\?"<>\|]', '-', name_clean).strip()
    
    # Correzioni specifiche note
    if "tumtiri" in name_clean.lower() or "tum tir e paratir" in name_clean.lower():
        name_clean = "Tum tir e paratir"
    elif "anuerismi" in name_clean.lower():
        name_clean = "Aneurismi"
    elif "ipert polm" in name_clean.lower() or "mxmlb" in name_clean.lower():
        name_clean = "Ipert polm, tum card"
            
    # Restituisce in Title Case per eleganza nei file finali
    return name_clean.title()

def get_mp4_creation_time_from_file(file_path: str) -> Optional[float]:
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

def extract_events_mapping(events_pb_source) -> Dict[str, Dict[str, Any]]:
    session_to_attachment = {}
    session_to_title = {}
    session_to_duration = {}
    
    if isinstance(events_pb_source, bytes):
        data = events_pb_source
    else:
        try:
            with open(events_pb_source, 'rb') as f:
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
# STRUMENTI PERSONALIZZATI PER L'AGENTE (Google Antigravity Custom Tools)
# ================================================================================

import json

def get_parent_search_dir() -> str:
    """Carica il percorso genitore configurato per la ricerca di file su iCloud Drive."""
    mappings_file = os.path.join(WORKSPACE_ROOT, "scratch", "export_mappings.json")
    default_icloud = "/Users/mattiapinchera/Library/Mobile Documents/com~apple~CloudDocs/"
    default_uni = "/Users/mattiapinchera/Library/Mobile Documents/com~apple~CloudDocs/Università-Docs e Registrazioni"
    default_parent = default_uni if os.path.exists(default_uni) else default_icloud
    if os.path.exists(mappings_file):
        try:
            with open(mappings_file, 'r', encoding='utf-8') as f:
                mappings = json.load(f)
            return mappings.get("__PARENT_SEARCH_DIR__", default_parent)
        except Exception:
            pass
    return default_parent

def resolve_notebook_path(notebook_name: str) -> Optional[str]:
    """Cerca ricorsivamente il file del notebook per nome nella cartella iCloud genitore."""
    parent_dir = get_parent_search_dir()
    if not os.path.exists(parent_dir):
        return None
        
    for root, dirs, files in os.walk(parent_dir):
        # Ignora cartelle nascoste o di sistema
        dirs[:] = [d for d in dirs if not d.startswith('.') and not d.startswith('~') and d != "audio non miei"]
        for f in files:
            if f.startswith('.') or f.startswith('~'):
                continue
            name_without_ext = f.replace('.goodnotes', '').replace('.zip', '')
            if name_without_ext.lower() == notebook_name.lower():
                return os.path.join(root, f)
    return None

def list_notebooks() -> List[Dict[str, Any]]:
    """Elenca tutti i notebook Goodnotes disponibili nella cartella iCloud.

    Rileva i pacchetti .goodnotes/.zip ricorsivamente in iCloud Drive senza copiarli.
    """
    notebooks = []
    parent_dir = get_parent_search_dir()
    if not os.path.exists(parent_dir):
        return []
        
    for root, dirs, files in os.walk(parent_dir):
        # Ignora cartelle nascoste o di sistema
        dirs[:] = [d for d in dirs if not d.startswith('.') and not d.startswith('~') and d != "audio non miei"]
        for f in files:
            if f.startswith('.') or f.startswith('~'):
                continue
            
            is_goodnotes_pkg = f.endswith('.goodnotes') or f.endswith('.zip')
            if is_goodnotes_pkg:
                full_path = os.path.join(root, f)
                size_bytes = os.path.getsize(full_path)
                
                # Calcola il percorso relativo rispetto alla cartella genitore per visualizzarlo pulito
                rel_path = os.path.relpath(full_path, parent_dir)
                
                notebooks.append({
                    "name": f.replace('.goodnotes', '').replace('.zip', ''),
                    "filename": f,
                    "relative_path": rel_path,
                    "type": "Quaderno Goodnotes" if f.endswith('.goodnotes') else "Archivio Compresso",
                    "size_mb": round(size_bytes / (1024 * 1024), 2),
                    "path": full_path,
                    "mtime": os.path.getmtime(full_path)
                })
            
    return sorted(notebooks, key=lambda x: x["name"])

def import_goodnotes(zip_or_folder_path: str) -> str:
    """Funzione deprecata poiché il caricamento è ora 100% diretto e in locale da iCloud."""
    return "[✓] Il collegamento a iCloud è ora completamente diretto e automatico! Nessuna copia locale necessaria."

def analyze_notebook_audios(notebook_name: str) -> Dict[str, Any]:
    """Analizza i metadati audio di un notebook in iCloud e restituisce le registrazioni rilevate.

    Esegue la decifratura e la normalizzazione dei nomi per l'anteprima, senza estrarre nulla su disco!

    Args:
        notebook_name: Nome del notebook (es. 'AnatoPat' o 'Pato Sis')
    """
    notebook_path = resolve_notebook_path(notebook_name)
    if not notebook_path or not os.path.exists(notebook_path):
        return {"error": f"Notebook '{notebook_name}' non trovato nella cartella iCloud."}
        
    try:
        with zipfile.ZipFile(notebook_path, 'r') as z:
            namelist = z.namelist()
            
            if "index.events.pb" not in namelist:
                return {"error": "Il notebook non contiene il file index.events.pb valido."}
                
            events_pb_data = z.read("index.events.pb")
            mappa_audio = extract_events_mapping(events_pb_data)
            
            recordings = []
            for att_uuid, info in mappa_audio.items():
                att_path = f"attachments/{att_uuid}"
                if att_path not in namelist:
                    continue # Salta le registrazioni fantasma (eliminate dall'utente in Goodnotes ma rimaste nei log dei metadati)
                
                status = "Presente"
                size_bytes = z.getinfo(att_path).file_size
                original_title = info["title"]
                clean_title = clean_filename(original_title) if original_title else "Registrazione Senza Nome"
                
                dt_obj = None
                if status == "Presente":
                    try:
                        with z.open(att_path) as member_f:
                            member_data = member_f.read(256 * 1024)
                            idx = member_data.find(b'mvhd')
                            if idx != -1:
                                version = member_data[idx + 4]
                                if version == 0:
                                    creation_time_bytes = member_data[idx + 8 : idx + 12]
                                    seconds_since_1904 = struct.unpack('>I', creation_time_bytes)[0]
                                elif version == 1:
                                    creation_time_bytes = member_data[idx + 8 : idx + 16]
                                    seconds_since_1904 = struct.unpack('>Q', creation_time_bytes)[0]
                                else:
                                    seconds_since_1904 = None
                                    
                                if seconds_since_1904:
                                    unix_time = seconds_since_1904 - 2082844800
                                    dt_obj = datetime.fromtimestamp(unix_time)
                    except Exception:
                        pass
                        
                    if not dt_obj:
                        try:
                            zinfo = z.getinfo(att_path)
                            import time
                            dt_tuple = zinfo.date_time + (0, 0, -1)
                            mtime = time.mktime(dt_tuple)
                            dt_obj = datetime.fromtimestamp(mtime)
                        except Exception:
                            pass
                            
                date_str = dt_obj.strftime('%d/%m/%Y %H:%M') if dt_obj else "N/A"
                date_prefix = dt_obj.strftime('%d_%m') if dt_obj else "00_00"
                
                recordings.append({
                    "uuid": att_uuid,
                    "raw_title": original_title,
                    "clean_title": clean_title,
                    "duration": info["duration"],
                    "size_mb": round(size_bytes / (1024 * 1024), 2),
                    "date": date_str,
                    "date_prefix": date_prefix,
                    "status": status
                })
                
            return {
                "notebook": notebook_name,
                "total_recordings": len(recordings),
                "recordings": sorted(recordings, key=lambda r: r["date"])
            }
            
    except Exception as e:
        return {"error": f"Errore durante l'analisi: {str(e)}"}

def export_notebook_audios(notebook_name: str, format_audio: str = "m4a", custom_export_dir: str = None, selected_uuids: list = None) -> str:
    """Decodifica, rinomina, deduplica ed esporta i file audio reali direttamente da iCloud.

    Applica la decodifica Caesar Cipher, normalizza i font matematici e applica la deduplicazione cronologica.

    Args:
        notebook_name: Nome del notebook da esportare (es. 'AnatoPat').
        format_audio: Formato audio da esportare. Opzioni: 'm4a' (super leggero, copia diretta) o 'wav' (convertito nativamente).
        custom_export_dir: Percorso personalizzato per salvare i file audio esportati.
        selected_uuids: Lista opzionale di UUID delle registrazioni da esportare (selettiva).
    """
    notebook_path = resolve_notebook_path(notebook_name)
    if not notebook_path or not os.path.exists(notebook_path):
        return f"[x] Errore: Notebook '{notebook_name}' non trovato nella cartella iCloud."
        
    if format_audio.lower() not in ["m4a", "wav"]:
        return "[x] Errore: Formato audio non valido. Scegli tra 'm4a' o 'wav'."
        
    try:
        with zipfile.ZipFile(notebook_path, 'r') as z:
            namelist = z.namelist()
            if "index.events.pb" not in namelist:
                return "[x] Errore: File index.events.pb non trovato nel pacchetto iCloud!"
                
            events_pb_data = z.read("index.events.pb")
            mappa_audio = extract_events_mapping(events_pb_data)
            
            is_ios = (sys.platform == 'ios') or (os.environ.get('TERM_PROGRAM') == 'a-Shell')
            if custom_export_dir:
                export_dir = os.path.abspath(os.path.expanduser(custom_export_dir))
            else:
                suffix = "_iOS" if is_ios else ""
                export_dir = os.path.join(SUCCESS_DIR, f"{notebook_name}_Audio{suffix}")
            
            if not os.path.exists(export_dir):
                os.makedirs(export_dir, exist_ok=True)
                
            success_copies = 0
            mappa_esportata = {}
            candidati = []
            
            for att_uuid, info in mappa_audio.items():
                if selected_uuids is not None and att_uuid not in selected_uuids:
                    continue
                att_path = f"attachments/{att_uuid}"
                if att_path in namelist:
                    dt_obj = None
                    try:
                        with z.open(att_path) as member_f:
                            member_data = member_f.read(256 * 1024)
                            idx = member_data.find(b'mvhd')
                            if idx != -1:
                                version = member_data[idx + 4]
                                if version == 0:
                                    creation_time_bytes = member_data[idx + 8 : idx + 12]
                                    seconds_since_1904 = struct.unpack('>I', creation_time_bytes)[0]
                                elif version == 1:
                                    creation_time_bytes = member_data[idx + 8 : idx + 16]
                                    seconds_since_1904 = struct.unpack('>Q', creation_time_bytes)[0]
                                else:
                                    seconds_since_1904 = None
                                    
                                if seconds_since_1904:
                                    unix_time = seconds_since_1904 - 2082844800
                                    dt_obj = datetime.fromtimestamp(unix_time)
                    except Exception:
                        pass
                        
                    if not dt_obj:
                        try:
                            zinfo = z.getinfo(att_path)
                            import time
                            dt_tuple = zinfo.date_time + (0, 0, -1)
                            mtime = time.mktime(dt_tuple)
                            dt_obj = datetime.fromtimestamp(mtime)
                        except Exception:
                            pass
                            
                    size = z.getinfo(att_path).file_size
                    candidati.append({
                        "uuid": att_uuid,
                        "title_original": info["title"],
                        "dt_obj": dt_obj,
                        "duration": info["duration"],
                        "size": size
                    })
                    
            size_to_cands = {}
            for cand in candidati:
                sz = cand["size"]
                if sz not in size_to_cands:
                    size_to_cands[sz] = []
                size_to_cands[sz].append(cand)
                
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
    
            finali_da_copiare = []
            for sz, cands in size_to_cands.items():
                if len(cands) > 1:
                    def score_cand(c):
                        t = c["title_original"]
                        if not t or t.strip() == "Registrazione Senza Nome" or t.strip() == "":
                            return -100
                        return get_filename_score(clean_filename(t))
                    best_cand = sorted(cands, key=score_cand, reverse=True)[0]
                    finali_da_copiare.append(best_cand)
                else:
                    finali_da_copiare.append(cands[0])
                    
            finali_da_copiare.sort(key=lambda c: c["dt_obj"])
            
            clip_audio_counter = 1
            for cand in finali_da_copiare:
                title_orig = cand["title_original"]
                if not title_orig or title_orig.strip() == "Registrazione Senza Nome" or title_orig.strip() == "":
                    clean_title = f"Clip audio {clip_audio_counter}"
                    clip_audio_counter += 1
                else:
                    clean_title = clean_filename(title_orig)
                    
                date_prefix = cand["dt_obj"].strftime('%d_%m')
                date_display = cand["dt_obj"].strftime('%d %b %Y')
                
                dest_filename = f"{date_prefix} - {clean_title}.{format_audio.lower()}"
                dest_file = os.path.join(export_dir, dest_filename)
                
                skip_file = False
                if os.path.exists(dest_file):
                    if format_audio.lower() == "m4a" and os.path.getsize(dest_file) == cand["size"]:
                        skip_file = True
                    elif format_audio.lower() == "wav" and os.path.getsize(dest_file) > 0:
                        skip_file = True
                        
                if skip_file:
                    success_copies += 1
                    mappa_esportata[cand["uuid"]] = {
                        "uuid": cand["uuid"],
                        "original_title": cand["title_original"],
                        "clean_title": clean_title,
                        "date": date_display,
                        "duration": cand["duration"],
                        "filename": dest_filename
                    }
                    continue
                    
                try:
                    att_path = f"attachments/{cand['uuid']}"
                    if format_audio.lower() == "m4a":
                        with z.open(att_path) as src_f:
                            with open(dest_file, "wb") as dest_f:
                                shutil.copyfileobj(src_f, dest_f)
                        success_copies += 1
                    else: # wav
                        temp_src = os.path.join(SCRATCH_DIR, f"temp_{cand['uuid']}")
                        with z.open(att_path) as src_f:
                            with open(temp_src, "wb") as dest_f:
                                shutil.copyfileobj(src_f, dest_f)
                                
                        cmd = ["afconvert", "-f", "WAVE", "-d", "LEI16", temp_src, dest_file]
                        res = subprocess.run(cmd, capture_output=True, text=True)
                        
                        if os.path.exists(temp_src):
                            os.remove(temp_src)
                            
                        if res.returncode == 0:
                            success_copies += 1
                        else:
                            fallback_filename = dest_filename.replace(".wav", ".m4a")
                            fallback_dest = os.path.join(export_dir, fallback_filename)
                            with z.open(att_path) as src_f:
                                with open(fallback_dest, "wb") as dest_f:
                                    shutil.copyfileobj(src_f, dest_f)
                            dest_filename = fallback_filename
                            success_copies += 1
                            
                    try:
                        import time
                        mtime = time.mktime(cand["dt_obj"].timetuple())
                        os.utime(dest_file, (mtime, mtime))
                    except Exception:
                        pass
                        
                    mappa_esportata[cand["uuid"]] = {
                        "uuid": cand["uuid"],
                        "original_title": cand["title_original"],
                        "clean_title": clean_title,
                        "date": date_display,
                        "duration": cand["duration"],
                        "filename": dest_filename
                    }
                except Exception as e:
                    print(f"[!] Errore nella copia di {cand['uuid']}: {e}")
                    
            report_path = os.path.join(export_dir, "report_esportazione.json")
            with open(report_path, 'w', encoding='utf-8') as rf:
                import json
                json.dump(mappa_esportata, rf, indent=4, ensure_ascii=False)
                
            summary_msg = f"[✓] Esportazione completata per il notebook '{notebook_name}'.\n"
            summary_msg += f"    - Percorso esportazione: {export_dir}\n"
            summary_msg += f"    - Totale registrazioni esportate: {success_copies} (duplicati filtrati: {len(candidati) - len(finali_da_copiare)})\n"
            summary_msg += f"    - Formato esportato: {format_audio.upper()}"
            
            return summary_msg
            
    except Exception as e:
        return f"[x] Errore critico durante l'esportazione: {str(e)}"

def get_agent_status() -> Dict[str, Any]:
    """Ottiene lo stato generale di salute dell'ambiente e dei file dell'agente."""
    num_notebooks = len(list_notebooks())
    
    total_audio_folders = 0
    total_audio_files = 0
    
    scanned_paths = set()
    
    if os.path.exists(SUCCESS_DIR):
        for item in os.listdir(SUCCESS_DIR):
            item_path = os.path.join(SUCCESS_DIR, item)
            if os.path.isdir(item_path) and item.endswith("_Audio"):
                scanned_paths.add(os.path.abspath(item_path))
                
    mappings_file = os.path.join(WORKSPACE_ROOT, "scratch", "export_mappings.json")
    if os.path.exists(mappings_file):
        try:
            with open(mappings_file, 'r', encoding='utf-8') as f:
                import json
                mappings = json.load(f)
            for nb, path in mappings.items():
                if nb != "__PARENT_SEARCH_DIR__" and path:
                    expanded_path = os.path.abspath(os.path.expanduser(path))
                    if os.path.exists(expanded_path) and os.path.isdir(expanded_path):
                        scanned_paths.add(expanded_path)
        except Exception:
            pass
            
    for folder_path in scanned_paths:
        total_audio_folders += 1
        try:
            for f in os.listdir(folder_path):
                if f.endswith(".m4a") or f.endswith(".wav"):
                    total_audio_files += 1
        except Exception:
            pass
            
    return {
        "status": "In funzione (Collegamento iCloud Diretto)",
        "risorse_directory": get_parent_search_dir(),
        "success_directory": SUCCESS_DIR,
        "notebooks_in_risorse": num_notebooks,
        "cartelle_audio_in_success": total_audio_folders,
        "file_audio_esportati": total_audio_files,
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }

# ================================================================================
# PROCEDURA DI ESECUZIONE PRINCIPALE (Agent Setup & CLI Interactive Loop)
# ================================================================================

async def run_agent():
    print("=" * 80)
    print("         GOODNOTES AI AGENT - GOOGLE ANTIGRAVITY POWERED 🚀")
    print("=" * 80)
    
    # Controlla se la API key è configurata
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("[!] ATTENZIONE: La variabile d'ambiente GEMINI_API_KEY non è configurata.")
        print("    Per connettere l'agente a Gemini, puoi generare una chiave su:")
        print("    👉 https://aistudio.google.com/app/api-keys")
        print("-" * 80)
        
        # Chiedi interattivamente la chiave all'utente come fallback di emergenza
        try:
            user_key = input("Inserisci la tua GEMINI_API_KEY (premi invio per saltare e usare l'ambiente): ").strip()
            if user_key:
                os.environ["GEMINI_API_KEY"] = user_key
                api_key = user_key
        except KeyboardInterrupt:
            print("\nAnnullato.")
            return

    # Cartella per conservare la cronologia delle sessioni (Persistence)
    agent_session_dir = os.path.join(WORKSPACE_ROOT, "scratch", "sessions")
    agent_app_data_dir = os.path.join(WORKSPACE_ROOT, "scratch", "agent_data")
    os.makedirs(agent_session_dir, exist_ok=True)
    os.makedirs(agent_app_data_dir, exist_ok=True)

    # Istruzioni di sistema dettagliate (Persona) in italiano
    system_instructions = (
        "Sei l'Agente AI di Goodnotes, un assistente virtuale esperto e cortese, integrato nel "
        "sistema locale per la gestione autonoma dei notebook di Goodnotes 6 e l'esportazione audio.\n\n"
        
        "Le tue responsabilità e regole operative sono:\n"
        "1. Aiutare l'utente a elencare, importare, analizzare ed esportare le registrazioni audio dei suoi notebook.\n"
        "2. Comunica SEMPRE in lingua italiana con un tono professionale, cordiale, preciso ed amichevole.\n"
        "3. Quando l'utente ti chiede di elencare i notebook, usa lo strumento `list_notebooks`.\n"
        "4. Quando l'utente vuole importare un file, chiedi il percorso e usa lo strumento `import_goodnotes`.\n"
        "5. Quando l'utente ti chiede di analizzare le registrazioni o i contenuti di un notebook, usa `analyze_notebook_audios` "
        "e presenta i risultati in modo ordinato sotto forma di tabella Markdown (colonne: Data Reg., Titolo Decifrato, Durata, Peso, Stato).\n"
        "6. Spiega che decifri automaticamente i titoli criptati con Caesar cipher (es. i titoli incomprensibili come 'uitibbqm interstiziali' "
        "diventano puliti in italiano come 'Malattie Interstiziali') e normalizzi i font matematici complessi (Unicode Bold/Italic) "
        "in caratteri UTF-8 standard per renderli perfettamente cercabili su Spotlight o Finder.\n"
        "7. Quando l'utente decide di esportare gli audio, usa lo strumento `export_notebook_audios`. Specifica che applichi la "
        "deduplicazione cronologica basata sulla dimensione del file sorgente per rimuovere copie corrotte derivanti dai log di Goodnotes, "
        "e rinomini i file secondo la regola 'GG_MM - Titolo Registrazione.m4a'.\n"
        "8. Se l'utente ti chiede informazioni sullo stato del sistema o della salute operativa, usa `get_agent_status`.\n"
        "9. Non inventare dati, usa sempre i tuoi strumenti per analizzare la cartella 'Risorse' locale."
    )

    # Configurazione dell'agente localizzato
    config = LocalAgentConfig(
        tools=[
            list_notebooks,
            import_goodnotes,
            analyze_notebook_audios,
            export_notebook_audios,
            get_agent_status
        ],
        system_instructions=system_instructions,
        save_dir=agent_session_dir,
        app_data_dir=agent_app_data_dir,
        # Default model di Antigravity SDK
        model="gemini-3.5-flash"
    )

    print("[*] Avvio dell'Agente AI con Google Antigravity...")
    try:
        async with Agent(config=config) as agent:
            print("[✓] Agente inizializzato correttamente in lingua italiana.")
            print("[*] Puoi iniziare a chattare con l'agente. Ad esempio:")
            print("    - 'Quali notebook ho in Risorse?'")
            print("    - 'Analizza il notebook AnatoPat'")
            print("    - 'Esporta gli audio di AnatoPat'")
            print("    - 'Scansiona lo stato del sistema'")
            print("    Scrivi 'exit' o 'quit' per chiudere.")
            print("-" * 80)
            
            # Avvia il loop interattivo di terminale nativo dell'SDK
            await agent.run_interactive_loop()
    except Exception as e:
        print(f"\n[x] ERRORE durante l'esecuzione dell'agente: {e}")
        print("    Verifica che la chiave GEMINI_API_KEY sia corretta e attiva.")

if __name__ == "__main__":
    try:
        asyncio.run(run_agent())
    except KeyboardInterrupt:
        print("\n[!] Chiusura dell'Agente AI di Goodnotes.")
        sys.exit(0)
