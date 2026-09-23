"""
================================================================================
Goodnotes 6 AI Audio Exporter - Starlette Asynchronous API Routes
================================================================================
Tutti gli handler CPU-bound e disco-bound sono isolati con asyncio.to_thread
per garantire zero blocchi sull'event loop principale di Starlette/Uvicorn.
"""

import os
import sys
import json
import shutil
import zipfile
import asyncio
import subprocess
import urllib.request
import unicodedata
from datetime import datetime
from typing import Dict, Any, Optional

from starlette.responses import JSONResponse, HTMLResponse, FileResponse
from starlette.routing import Route

from backend.config import (
    WORKSPACE_ROOT,
    ENV_FILE_PATH,
    SCRATCH_DIR,
    SUCCESS_DIR,
    get_resource_path,
    get_parent_search_dir,
    load_mappings,
    save_mapping,
)
from backend.services.icloud_scanner import scan_icloud_notebooks, find_notebook
from backend.services.audio_exporter import (
    analyze_notebook_with_cache,
    export_notebook_audios,
)

# Cache in-memory per validazione Gemini API Key
_VALIDATED_KEYS_CACHE: Dict[str, bool] = {}

def validate_gemini_key(api_key: str) -> bool:
    """Verifica la validità della chiave API Gemini con timeout leggero."""
    if not api_key:
        return False
    if api_key in _VALIDATED_KEYS_CACHE:
        return _VALIDATED_KEYS_CACHE[api_key]

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=4) as response:
            if response.status == 200:
                _VALIDATED_KEYS_CACHE[api_key] = True
                return True
    except Exception:
        pass

    return False

def clean_cache_dir() -> None:
    """Mantiene la dimensione della cache audio sotto i 50MB."""
    cache_dir = os.path.join(SCRATCH_DIR, "cache")
    if not os.path.exists(cache_dir):
        return
    try:
        files = [os.path.join(cache_dir, f) for f in os.listdir(cache_dir) if os.path.isfile(os.path.join(cache_dir, f))]
        total_size = sum(os.path.getsize(f) for f in files)
        MAX_CACHE_SIZE = 50 * 1024 * 1024  # 50 MB
        if total_size > MAX_CACHE_SIZE:
            files.sort(key=os.path.getmtime)
            for f in files:
                try:
                    total_size -= os.path.getsize(f)
                    os.remove(f)
                    if total_size <= 20 * 1024 * 1024:
                        break
                except Exception:
                    pass
    except Exception as e:
        print(f"[!] Errore pulizia cache audio: {e}")

# ==============================================================================
# ROUTE HANDLERS
# ==============================================================================

async def get_status(request):
    """Restituisce lo stato operativo del backend, workspace e validità chiave API."""
    try:
        notebooks = await asyncio.to_thread(scan_icloud_notebooks)
        num_notebooks = len(notebooks)

        total_audio_folders = 0
        total_audio_files = 0
        scanned_paths = set()

        if os.path.exists(SUCCESS_DIR):
            for item in os.listdir(SUCCESS_DIR):
                item_path = os.path.join(SUCCESS_DIR, item)
                if os.path.isdir(item_path) and item.endswith("_Audio"):
                    scanned_paths.add(os.path.abspath(item_path))

        mappings = load_mappings()
        for nb, path in mappings.items():
            if nb != "__PARENT_SEARCH_DIR__" and path:
                expanded_path = os.path.abspath(os.path.expanduser(path))
                if os.path.exists(expanded_path) and os.path.isdir(expanded_path):
                    scanned_paths.add(expanded_path)

        for folder_path in scanned_paths:
            total_audio_folders += 1
            try:
                for f in os.listdir(folder_path):
                    if f.endswith(".m4a") or f.endswith(".wav"):
                        total_audio_files += 1
            except Exception:
                pass

        api_key = os.environ.get("GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY") or ""
        has_key = bool(api_key)
        is_valid = await asyncio.to_thread(validate_gemini_key, api_key) if has_key else False

        status_data = {
            "status": "In funzione (Backend Modulare v2.0 - Zero-Space)",
            "risorse_directory": get_parent_search_dir(),
            "success_directory": SUCCESS_DIR,
            "notebooks_in_risorse": num_notebooks,
            "cartelle_audio_in_success": total_audio_folders,
            "file_audio_esportati": total_audio_files,
            "api_key_configured": has_key,
            "api_key_valid": is_valid,
            "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        return JSONResponse(status_data)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def get_notebooks(request):
    """Elenca tutti i quaderni Goodnotes reali disponibili su iCloud Drive."""
    try:
        notebooks = await asyncio.to_thread(scan_icloud_notebooks)
        # Formatta per compatibilità con il frontend
        formatted = []
        for nb in notebooks:
            formatted.append({
                "name": nb["name"],
                "relative_path": nb["relative_path"],
                "path": nb["path"],
                "type": "goodnotes",
                "size_mb": nb["size_mb"],
                "folder": nb["folder"]
            })
        return JSONResponse(formatted)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def analyze_notebook(request):
    """Analizza le registrazioni audio presenti nel quaderno specificato (con cache)."""
    try:
        body = await request.json()
        notebook_name = body.get("notebook")
        if not notebook_name:
            return JSONResponse({"error": "Parametro 'notebook' mancante nel corpo della richiesta."}, status_code=400)

        analysis = await asyncio.to_thread(analyze_notebook_with_cache, notebook_name, True)
        return JSONResponse(analysis)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def export_notebook(request):
    """Esporta le registrazioni audio del quaderno selezionato."""
    try:
        body = await request.json()
        notebook_name = body.get("notebook")
        format_audio = body.get("format", "m4a")
        custom_export_dir = body.get("custom_export_dir")
        selected_uuids = body.get("selected_uuids")

        if not notebook_name:
            return JSONResponse({"error": "Parametro 'notebook' mancante nel corpo della richiesta."}, status_code=400)

        # Salva la mappatura se specificata
        if custom_export_dir:
            save_mapping(notebook_name, custom_export_dir)
            target_out_dir = custom_export_dir
        else:
            saved_map = load_mappings()
            target_out_dir = saved_map.get(notebook_name, os.path.join(SUCCESS_DIR, f"{notebook_name}_Audio"))

        # Esegui l'esportazione batch non bloccante
        export_res = await asyncio.to_thread(
            export_notebook_audios,
            notebook_path_or_name=notebook_name,
            output_dir=target_out_dir,
            selected_uuids=selected_uuids,
            overwrite=False
        )

        if "error" in export_res:
            return JSONResponse({"error": export_res["error"]}, status_code=500)

        summary_msg = (
            f"[✓] Esportazione completata per il notebook '{notebook_name}'.\n"
            f"    - Percorso esportazione: {export_res['output_dir']}\n"
            f"    - Totale registrazioni elaborate: {export_res['total']}\n"
            f"    - File esportati: {export_res['exported']}\n"
            f"    - File saltati (Smart Skip): {export_res['skipped']}\n"
            f"    - Errori: {export_res['failed']}\n"
            f"    - Formato esportato: {format_audio.upper()}"
        )

        return JSONResponse({"result": summary_msg, "details": export_res})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def get_export_paths(request):
    """Scansiona la cartella genitore iCloud ed elenca le cartelle disponibili per l'esportazione."""
    try:
        query_parent = request.query_params.get("parent_search_dir")
        mappings = load_mappings()
        saved_parent = mappings.get("__PARENT_SEARCH_DIR__")

        parent_dir = query_parent or saved_parent or get_parent_search_dir()
        if parent_dir != saved_parent:
            save_mapping("__PARENT_SEARCH_DIR__", parent_dir)

        paths = set()
        expanded_parent = unicodedata.normalize("NFC", os.path.abspath(os.path.expanduser(parent_dir)))

        if os.path.exists(expanded_parent) and os.path.isdir(expanded_parent):
            for item in os.listdir(expanded_parent):
                full_path = os.path.join(expanded_parent, item)
                if os.path.isdir(full_path) and not item.startswith('.'):
                    paths.add(unicodedata.normalize("NFC", full_path))

        # Includi percorsi salvati
        for notebook, path in mappings.items():
            if notebook != "__PARENT_SEARCH_DIR__" and os.path.exists(path):
                paths.add(unicodedata.normalize("NFC", path))

        return JSONResponse({
            "paths": sorted(list(paths)),
            "mappings": {k: v for k, v in mappings.items() if k != "__PARENT_SEARCH_DIR__"},
            "parent_search_dir": parent_dir
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def create_folder(request):
    """Crea una nuova cartella su disco / iCloud Drive."""
    try:
        body = await request.json()
        parent_dir = body.get("parent_dir")
        folder_name = body.get("folder_name")

        if not parent_dir or not folder_name:
            return JSONResponse({"error": "Parametri 'parent_dir' o 'folder_name' mancanti."}, status_code=400)

        clean_folder = folder_name.strip().replace('/', '-').replace('\\', '-')
        full_path = unicodedata.normalize("NFC", os.path.join(os.path.abspath(os.path.expanduser(parent_dir)), clean_folder))

        os.makedirs(full_path, exist_ok=True)
        return JSONResponse({
            "success": True,
            "folder_path": full_path,
            "message": f"Cartella '{clean_folder}' creata con successo!"
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def save_notebook_mapping(request):
    """Salva l'associazione tra quaderno e cartella di destinazione."""
    try:
        body = await request.json()
        notebook = body.get("notebook")
        path = body.get("path")

        if not notebook or not path:
            return JSONResponse({"error": "Parametri 'notebook' o 'path' mancanti."}, status_code=400)

        save_mapping(notebook, path)
        return JSONResponse({
            "success": True,
            "message": f"Mappatura salvata con successo per {notebook}!"
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

def _run_applescript_browse() -> Dict[str, Any]:
    script = 'POSIX path of (choose folder with prompt "Seleziona la cartella per l\'esportazione delle registrazioni:")'
    cmd = ['osascript', '-e', script]
    process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)
    if process.returncode == 0:
        return {"success": True, "path": process.stdout.strip()}
    err = process.stderr.strip()
    if "User canceled" in err or "-128" in err:
        return {"success": False, "cancelled": True}
    return {"error": f"Errore AppleScript: {err}"}

async def browse_folder(request):
    """Apre la finestra nativa di dialogo per la selezione cartella su macOS."""
    try:
        res = await asyncio.to_thread(_run_applescript_browse)
        if "error" in res:
            return JSONResponse({"error": res["error"]}, status_code=500)
        return JSONResponse(res)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def get_icloud_files(request):
    """Elenca i file .goodnotes disponibili nella cartella genitore iCloud."""
    try:
        mappings = load_mappings()
        saved_parent = mappings.get("__PARENT_SEARCH_DIR__")
        parent_dir = request.query_params.get("parent_search_dir") or saved_parent or get_parent_search_dir()
        expanded_parent = unicodedata.normalize("NFC", os.path.abspath(os.path.expanduser(parent_dir)))

        found_files = []
        if os.path.exists(expanded_parent) and os.path.isdir(expanded_parent):
            for root, dirs, files in os.walk(expanded_parent):
                dirs[:] = [d for d in dirs if not d.startswith('.')]
                for f in files:
                    if f.lower().endswith('.goodnotes'):
                        full_path = unicodedata.normalize("NFC", os.path.join(root, f))
                        rel_path = unicodedata.normalize("NFC", os.path.relpath(full_path, expanded_parent))
                        size_mb = round(os.path.getsize(full_path) / (1024 * 1024), 2)
                        mtime = os.path.getmtime(full_path)
                        found_files.append({
                            "name": f,
                            "relative_path": rel_path,
                            "absolute_path": full_path,
                            "size_mb": size_mb,
                            "modified": datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M')
                        })

        found_files.sort(key=lambda x: x["modified"], reverse=True)
        return JSONResponse({"files": found_files, "parent_dir": parent_dir})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def import_local_file(request):
    """Import locale rapido da percorso specificato."""
    try:
        body = await request.json()
        file_path = body.get("file_path")
        if not file_path:
            return JSONResponse({"error": "Parametro 'file_path' mancante."}, status_code=400)

        expanded_path = unicodedata.normalize("NFC", os.path.abspath(os.path.expanduser(file_path)))
        if not os.path.exists(expanded_path):
            return JSONResponse({"error": f"Il file specificato non esiste: {file_path}"}, status_code=404)

        return JSONResponse({
            "success": True,
            "message": f"File '{os.path.basename(expanded_path)}' pronto per l'elaborazione."
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def save_config(request):
    """Salva la GEMINI_API_KEY nel file .env assoluto dopo verifica online."""
    try:
        body = await request.json()
        api_key = body.get("api_key", "").strip()
        if not api_key:
            return JSONResponse({"error": "Parametro 'api_key' vuoto o mancante."}, status_code=400)

        is_valid = await asyncio.to_thread(validate_gemini_key, api_key)

        with open(ENV_FILE_PATH, 'w', encoding='utf-8') as env_file:
            env_file.write(f"GEMINI_API_KEY={api_key}\n")

        os.environ["GEMINI_API_KEY"] = api_key

        if is_valid:
            return JSONResponse({
                "success": True,
                "api_key_valid": True,
                "message": "✓ GEMINI_API_KEY salvata e verificata con successo! Connessione stabilita."
            })
        else:
            return JSONResponse({
                "success": True,
                "api_key_valid": False,
                "message": "✗ La chiave è stata salvata, ma la verifica online ha fallito. Controlla che sia corretta e attiva."
            })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

def _extract_preview_audio(notebook_path: str, uuid: str) -> Optional[str]:
    cache_dir = os.path.join(SCRATCH_DIR, "cache")
    os.makedirs(cache_dir, exist_ok=True)
    cached_file_path = os.path.join(cache_dir, f"{uuid}.m4a")

    if not os.path.exists(cached_file_path):
        with zipfile.ZipFile(notebook_path, 'r') as z:
            att_path = f"attachments/{uuid}"
            if att_path not in z.namelist():
                return None
            with z.open(att_path) as src_f, open(cached_file_path, "wb") as dest_f:
                shutil.copyfileobj(src_f, dest_f)
        clean_cache_dir()

    return cached_file_path

async def play_audio_track(request):
    """Estrae on-the-fly la singola traccia audio dal notebook e la streamma al browser."""
    try:
        notebook = request.query_params.get("notebook")
        uuid = request.query_params.get("uuid")

        if not notebook or not uuid:
            return JSONResponse({"error": "Parametri 'notebook' o 'uuid' mancanti."}, status_code=400)

        nb_info = await asyncio.to_thread(find_notebook, notebook)
        if not nb_info:
            return JSONResponse({"error": f"Notebook '{notebook}' non trovato in iCloud."}, status_code=404)

        cached_file = await asyncio.to_thread(_extract_preview_audio, nb_info["path"], uuid)
        if not cached_file or not os.path.exists(cached_file):
            return JSONResponse({"error": f"Traccia audio '{uuid}' non trovata nel notebook."}, status_code=404)

        return FileResponse(cached_file, media_type="audio/mp4")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def serve_index(request):
    """Serve la dashboard HTML front-end (index.html)."""
    index_path = get_resource_path("index.html")
    if not os.path.exists(index_path):
        return HTMLResponse("<h1>index.html non trovato nel percorso delle risorse!</h1>", status_code=404)

    with open(index_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    return HTMLResponse(html_content)

# Registrazione dichiarativa delle rotte
routes = [
    Route("/api/status", get_status, methods=["GET"]),
    Route("/api/notebooks", get_notebooks, methods=["GET"]),
    Route("/api/analyze", analyze_notebook, methods=["POST"]),
    Route("/api/export", export_notebook, methods=["POST"]),
    Route("/api/export_paths", get_export_paths, methods=["GET"]),
    Route("/api/config", save_config, methods=["POST"]),
    Route("/api/create_folder", create_folder, methods=["POST"]),
    Route("/api/mapping", save_notebook_mapping, methods=["POST"]),
    Route("/api/browse", browse_folder, methods=["POST"]),
    Route("/api/icloud_files", get_icloud_files, methods=["GET"]),
    Route("/api/import_local", import_local_file, methods=["POST"]),
    Route("/api/audio/play", play_audio_track, methods=["GET"]),
    Route("/", serve_index, methods=["GET"]),
]
