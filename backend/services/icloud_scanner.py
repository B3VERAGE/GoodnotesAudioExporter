"""
================================================================================
Goodnotes 6 AI Audio Exporter - iCloud Drive Notebook Scanner
================================================================================
Scansione ricorsiva robusta della cartella iCloud Drive:
- Tolleranza bidirezionale Unicode NFC/NFD per percorsi macOS.
- Riconoscimento rigoroso dei veri quaderni Goodnotes tramite firma 'index.events.pb'.
- Esclusione totale di archivi spuri (es. AnatoPat_Audio.zip) e cartelle ignorate ('audio non miei ').
"""

import os
import zipfile
import unicodedata
from typing import List, Dict, Any, Optional, Tuple

from backend.config import get_parent_search_dir

# Nomi di cartelle da ignorare tassativamente (confronto in lowercase e stripped)
IGNORED_FOLDER_NAMES = {
    "audio non miei",
    "audio",
    "docs",
    "success",
    "risorse",
    "scratch",
    ".trash",
}


_SCAN_CACHE: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_NAME_TO_PATH: Dict[str, str] = {}
_SCAN_CACHE_TTL = 10.0  # secondi

def scan_icloud_notebooks(search_dir: Optional[str] = None, force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Scansiona ricorsivamente la cartella specificata (o il default iCloud) alla ricerca
    dei soli file .goodnotes reali con metadati audio validi.
    """
    import time
    global _SCAN_CACHE, _NAME_TO_PATH

    if not search_dir:
        search_dir = get_parent_search_dir()

    search_dir_norm = unicodedata.normalize("NFC", os.path.abspath(os.path.expanduser(search_dir)))

    if not force_refresh and search_dir_norm in _SCAN_CACHE:
        cached_time, cached_list = _SCAN_CACHE[search_dir_norm]
        if time.time() - cached_time < _SCAN_CACHE_TTL:
            return cached_list

    if not os.path.exists(search_dir_norm):
        # Fallback NFD per compatibilità macOS APFS
        nfd_dir = unicodedata.normalize("NFD", search_dir_norm)
        if os.path.exists(nfd_dir):
            search_dir_norm = nfd_dir
        else:
            return []

    notebooks: List[Dict[str, Any]] = []

    for root, dirs, files in os.walk(search_dir_norm):
        # Normalizza e filtra ricorsivamente le sottodirectory
        filtered_dirs = []
        for d in dirs:
            d_norm = unicodedata.normalize("NFC", d).strip()
            # Ignora cartelle nascoste o speciali
            if d_norm.startswith('.') or d_norm.startswith('~'):
                continue
            if d_norm.lower() in IGNORED_FOLDER_NAMES:
                continue
            filtered_dirs.append(d)
        dirs[:] = filtered_dirs

        for f in files:
            f_norm = unicodedata.normalize("NFC", f).strip()
            if f_norm.startswith('.') or f_norm.startswith('~'):
                continue

            lower_name = f_norm.lower()
            # Deve terminare con .goodnotes o .zip
            if not (lower_name.endswith('.goodnotes') or lower_name.endswith('.zip')):
                continue

            # Esclusione categorica di archivi spuri derivanti da precedenti estrazioni o registrazioni esterne
            if "_audio.zip" in lower_name or "audio.zip" in lower_name:
                continue

            full_path = unicodedata.normalize("NFC", os.path.join(root, f))

            try:
                # 1. Verifica che sia un archivio zip valido
                if not zipfile.is_zipfile(full_path):
                    continue

                # 2. Verifica la firma distintiva Goodnotes 6: index.events.pb
                with zipfile.ZipFile(full_path, 'r') as zf:
                    namelist = zf.namelist()
                    if "index.events.pb" not in namelist:
                        continue

                stat = os.stat(full_path)
                rel_path = unicodedata.normalize("NFC", os.path.relpath(full_path, search_dir_norm))
                folder_name = unicodedata.normalize("NFC", os.path.basename(root))

                # Estrai il nome del quaderno senza estensione
                notebook_name = f_norm
                if notebook_name.lower().endswith('.goodnotes'):
                    notebook_name = notebook_name[:-10]
                elif notebook_name.lower().endswith('.zip'):
                    notebook_name = notebook_name[:-4]

                nb_info = {
                    "path": full_path,
                    "relative_path": rel_path,
                    "name": notebook_name,
                    "folder": folder_name,
                    "mtime": stat.st_mtime,
                    "size_bytes": stat.st_size,
                    "size_mb": round(stat.st_size / (1024 * 1024), 2),
                }
                notebooks.append(nb_info)
                _NAME_TO_PATH[notebook_name.lower()] = full_path
            except Exception:
                continue

    sorted_nbs = sorted(notebooks, key=lambda nb: nb["name"].lower())
    _SCAN_CACHE[search_dir_norm] = (time.time(), sorted_nbs)
    return sorted_nbs

def find_notebook(name_or_path: str, search_dir: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Risolve un quaderno cercandolo per nome esatto (case-insensitive) o percorso.
    """
    target_clean = name_or_path.strip().lower().replace('.goodnotes', '').replace('.zip', '')

    # 1. Se è già un percorso assoluto esistente
    if os.path.isabs(name_or_path) and os.path.exists(name_or_path):
        norm_p = unicodedata.normalize("NFC", name_or_path)
        stat = os.stat(norm_p)
        base = os.path.basename(norm_p)
        clean_name = base.replace('.goodnotes', '').replace('.zip', '')
        return {
            "path": norm_p,
            "relative_path": base,
            "name": clean_name,
            "folder": os.path.basename(os.path.dirname(norm_p)),
            "mtime": stat.st_mtime,
            "size_bytes": stat.st_size,
            "size_mb": round(stat.st_size / (1024 * 1024), 2),
        }

    # 2. Check rapido da indice nomi
    if target_clean in _NAME_TO_PATH:
        cached_path = _NAME_TO_PATH[target_clean]
        if os.path.exists(cached_path):
            stat = os.stat(cached_path)
            base = os.path.basename(cached_path)
            clean_name = base.replace('.goodnotes', '').replace('.zip', '')
            return {
                "path": cached_path,
                "relative_path": base,
                "name": clean_name,
                "folder": os.path.basename(os.path.dirname(cached_path)),
                "mtime": stat.st_mtime,
                "size_bytes": stat.st_size,
                "size_mb": round(stat.st_size / (1024 * 1024), 2),
            }

    # 3. Altrimenti scansiona la cartella configurata
    all_nbs = scan_icloud_notebooks(search_dir)
    for nb in all_nbs:
        if nb["name"].lower() == target_clean:
            return nb

    return None

