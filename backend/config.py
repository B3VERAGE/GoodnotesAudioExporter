"""
================================================================================
Goodnotes 6 AI Audio Exporter - Configuration & Dynamic Paths
================================================================================
Gestione unificata e dinamica di percorsi, environment, porte TCP e risoluzione bundle.
"""

import os
import sys
import json
import socket
import unicodedata
from typing import Optional, Dict, Any

# Determina la radice reale del workspace dell'utente (anche se compilato in .app da PyInstaller)
if hasattr(sys, '_MEIPASS'):
    _exe_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
    if ".app/Contents/MacOS" in _exe_dir:
        WORKSPACE_ROOT = os.path.abspath(os.path.join(_exe_dir, "../../../../"))
    else:
        WORKSPACE_ROOT = _exe_dir
else:
    WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# Caricamento deterministico del file .env con percorso assoluto
ENV_FILE_PATH = os.path.join(WORKSPACE_ROOT, ".env")
try:
    from dotenv import load_dotenv
    if os.path.exists(ENV_FILE_PATH):
        load_dotenv(ENV_FILE_PATH)
except ImportError:
    pass

# Directory principali del workspace
RISORSE_DIR = os.path.join(WORKSPACE_ROOT, "Risorse")
SUCCESS_DIR = os.path.join(WORKSPACE_ROOT, "Success")
SCRATCH_DIR = os.path.join(WORKSPACE_ROOT, "scratch")
MAPPINGS_FILE_PATH = os.path.join(SCRATCH_DIR, "export_mappings.json")

# Assicura che le cartelle essenziali esistano
for _d in (RISORSE_DIR, SUCCESS_DIR, SCRATCH_DIR):
    os.makedirs(_d, exist_ok=True)

# Percorsi iCloud predefiniti (normalizzati in NFC per coerenza su macOS)
_ICLOUD_BASE = os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs")
_DEFAULT_UNI_NAME = "Università-Docs e Registrazioni"
DEFAULT_ICLOUD_PARENT = unicodedata.normalize("NFC", os.path.join(_ICLOUD_BASE, _DEFAULT_UNI_NAME))
DEFAULT_FALLBACK_ICLOUD = unicodedata.normalize("NFC", _ICLOUD_BASE)

def get_resource_path(relative_path: str) -> str:
    """
    Risolve il percorso assoluto di una risorsa (es. index.html).
    Supporta sia l'esecuzione da sorgente che il bundle PyInstaller (_MEIPASS).
    """
    if hasattr(sys, '_MEIPASS'):
        bundle_path = os.path.join(sys._MEIPASS, relative_path)
        if os.path.exists(bundle_path):
            return bundle_path
    return os.path.join(WORKSPACE_ROOT, relative_path)

def find_free_port(preferred_port: int = 8000) -> int:
    """
    Trova una porta TCP libera sul localhost.
    Privilegia la porta preferita (default 8000), ripiegando su una porta effimera
    assegnata dinamicamente dal kernel del sistema operativo.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('127.0.0.1', preferred_port))
            return preferred_port
        except OSError:
            pass

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def load_mappings() -> Dict[str, Any]:
    """Carica le mappature di esportazione persistenti da export_mappings.json."""
    if os.path.exists(MAPPINGS_FILE_PATH):
        try:
            with open(MAPPINGS_FILE_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_mapping(key: str, val: str) -> None:
    """Salva una mappatura (quaderno -> cartella o __PARENT_SEARCH_DIR__)."""
    mappings = load_mappings()
    mappings[key] = val
    try:
        with open(MAPPINGS_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(mappings, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"[!] Errore salvataggio mapping in {MAPPINGS_FILE_PATH}: {e}")

def get_parent_search_dir() -> str:
    """
    Restituisce la cartella radice per la scansione dei quaderni iCloud.
    Priorità:
      1. Percorso salvato in export_mappings.json (__PARENT_SEARCH_DIR__) se esistente su disco.
      2. Percorso specifico Università iCloud se esistente.
      3. Cartella radice CloudDocs generica.
    Tutti i percorsi sono normalizzati in NFC.
    """
    mappings = load_mappings()
    saved = mappings.get("__PARENT_SEARCH_DIR__")
    if saved and os.path.exists(saved):
        return unicodedata.normalize("NFC", saved)

    # Verifica presenza cartella Università (testando sia forma NFD che NFC)
    if os.path.exists(DEFAULT_ICLOUD_PARENT):
        return DEFAULT_ICLOUD_PARENT
    nfd_candidate = unicodedata.normalize("NFD", DEFAULT_ICLOUD_PARENT)
    if os.path.exists(nfd_candidate):
        return unicodedata.normalize("NFC", nfd_candidate)

    return DEFAULT_FALLBACK_ICLOUD
