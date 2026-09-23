#!/usr/bin/env python3
"""
================================================================================
Goodnotes AI Agent - Local API Server (Gold Standard Edition)
================================================================================
Questo script avvia un server API locale leggero basato su Starlette e Uvicorn.
Funge da backend per il pannello di controllo web visivo dell'agente.

Esecuzione:
   ./.venv/bin/python agent_server.py
================================================================================
"""

import os
import sys
import json
import uvicorn
import zipfile
import shutil
from starlette.applications import Starlette
from starlette.responses import JSONResponse, HTMLResponse, FileResponse
from starlette.routing import Route
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

# Determina la radice reale del workspace dell'utente (anche quando compilato in .app)
if hasattr(sys, '_MEIPASS'):
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

# Assicura che la directory corrente e sys._MEIPASS siano nel path di ricerca moduli
sys.path.append(WORKSPACE_ROOT)
if hasattr(sys, '_MEIPASS'):
    sys.path.append(sys._MEIPASS)

def get_resource_path(relative_path):
    """Ottiene il percorso assoluto della risorsa, compatibile con PyInstaller dev e prod."""
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)

try:
    import goodnotes_agent
except ImportError as e:
    print(f"[x] Errore nell'importazione di goodnotes_agent: {e}")
    sys.exit(1)

# Percorsi dei file
ENV_FILE_PATH = os.path.join(WORKSPACE_ROOT, ".env")
INDEX_HTML_PATH = get_resource_path("index.html")
MAPPINGS_FILE_PATH = os.path.join(WORKSPACE_ROOT, "scratch", "export_mappings.json")
SUCCESS_DIR = os.path.join(WORKSPACE_ROOT, "Success")
RISORSE_DIR = os.path.join(WORKSPACE_ROOT, "Risorse")

# ================================================================================
# FUNZIONI DI SUPPORTO PER LE MAPPATURE DELLE CARTELLE (Persistence)
# ================================================================================

def load_mappings() -> dict:
    if os.path.exists(MAPPINGS_FILE_PATH):
        try:
            with open(MAPPINGS_FILE_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_mapping(notebook: str, path: str):
    os.makedirs(os.path.dirname(MAPPINGS_FILE_PATH), exist_ok=True)
    mappings = load_mappings()
    mappings[notebook] = path
    try:
        with open(MAPPINGS_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(mappings, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"[!] Errore nel salvataggio della mappatura: {e}")

# ================================================================================
# FUNZIONI DELLE ROTTE API
# ================================================================================

async def get_export_paths(request):
    """Scansiona la cartella genitore specificata (es. iCloud) ed elenca tutte le sottocartelle per l'esportazione."""
    try:
        query_parent = request.query_params.get("parent_search_dir")
        mappings = load_mappings()
        
        # Carica il percorso salvato o usa il query o usa il default intelligente di iCloud
        saved_parent = mappings.get("__PARENT_SEARCH_DIR__")
        
        default_icloud = "/Users/mattiapinchera/Library/Mobile Documents/com~apple~CloudDocs/"
        default_uni = "/Users/mattiapinchera/Library/Mobile Documents/com~apple~CloudDocs/Università-Docs e Registrazioni"
        
        default_parent = default_uni if os.path.exists(default_uni) else default_icloud
        parent_dir = query_parent or saved_parent or default_parent
        
        # Salva se è stato modificato
        if parent_dir != saved_parent:
            save_mapping("__PARENT_SEARCH_DIR__", parent_dir)
            
        paths = set()
        
        # Scansiona le sottocartelle del parent_dir (iCloud Drive)
        expanded_parent = os.path.abspath(os.path.expanduser(parent_dir))
        if os.path.exists(expanded_parent) and os.path.isdir(expanded_parent):
            for item in os.listdir(expanded_parent):
                full_path = os.path.join(expanded_parent, item)
                if os.path.isdir(full_path) and not item.startswith('.'):
                    paths.add(full_path)
                    
        # Aggiunge anche i percorsi già salvati nelle mappature per non perderli
        for notebook, path in mappings.items():
            if notebook != "__PARENT_SEARCH_DIR__" and os.path.exists(path):
                paths.add(path)
                
        return JSONResponse({
            "paths": sorted(list(paths)),
            "mappings": {k: v for k, v in mappings.items() if k != "__PARENT_SEARCH_DIR__"},
            "parent_search_dir": parent_dir
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def create_folder(request):
    """Crea fisicamente una nuova cartella su disco (es. su iCloud Drive) sotto la cartella corrente."""
    try:
        body = await request.json()
        parent_dir = body.get("parent_dir")
        folder_name = body.get("folder_name")
        
        if not parent_dir or not folder_name:
            return JSONResponse({"error": "Parametri 'parent_dir' o 'folder_name' mancanti."}, status_code=400)
            
        clean_folder_name = folder_name.strip().replace('/', '-').replace('\\', '-')
        full_path = os.path.join(os.path.abspath(os.path.expanduser(parent_dir)), clean_folder_name)
        
        os.makedirs(full_path, exist_ok=True)
        print(f"[*] Creata nuova cartella fisica su iCloud/Disco: {full_path}")
        
        return JSONResponse({
            "success": True,
            "folder_path": full_path,
            "message": f"Cartella '{clean_folder_name}' creata con successo su iCloud!"
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def save_notebook_mapping(request):
    """Salva istantaneamente l'associazione tra notebook e cartella di destinazione."""
    try:
        body = await request.json()
        notebook = body.get("notebook")
        path = body.get("path")
        
        if not notebook or not path:
            return JSONResponse({"error": "Parametri 'notebook' o 'path' mancanti."}, status_code=400)
            
        save_mapping(notebook, path)
        print(f"[*] Mappatura salvata istantaneamente: {notebook} -> {path}")
        
        return JSONResponse({
            "success": True,
            "message": f"Mappatura salvata con successo per {notebook}!"
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def browse_folder(request):
    """Apre un dialogo nativo di selezione cartella macOS tramite AppleScript."""
    try:
        import subprocess
        
        print("[*] Apertura dialogo di selezione cartella macOS...")
        # Comando AppleScript per scegliere una cartella
        script = 'POSIX path of (choose folder with prompt "Seleziona la cartella per l\'esportazione delle registrazioni:")'
        cmd = ['osascript', '-e', script]
        
        # Esegue il comando e attende la risposta del Finder
        process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)
        
        if process.returncode == 0:
            chosen_path = process.stdout.strip()
            print(f"[*] Cartella selezionata dall'utente: {chosen_path}")
            return JSONResponse({
                "success": True,
                "path": chosen_path
            })
        else:
            # Se l'utente preme "Annulla"
            err = process.stderr.strip()
            if "User canceled" in err or "-128" in err:
                print("[*] Selezione cartella annullata dall'utente.")
                return JSONResponse({"success": False, "cancelled": True})
            else:
                print(f"[x] Errore AppleScript: {err}")
                return JSONResponse({"error": f"Errore AppleScript: {err}"}, status_code=500)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# In-memory cache for API key validation results to avoid redundant network calls
_VALIDATED_KEYS_CACHE = {}

def validate_gemini_key(api_key: str) -> bool:
    if not api_key:
        return False
    if api_key in _VALIDATED_KEYS_CACHE:
        return _VALIDATED_KEYS_CACHE[api_key]
    
    import urllib.request
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        req = urllib.request.Request(url, method="GET")
        # Lightweight check with short timeout
        with urllib.request.urlopen(req, timeout=4) as response:
            if response.status == 200:
                _VALIDATED_KEYS_CACHE[api_key] = True
                return True
    except Exception:
        pass
    
    # We do not cache False indefinitely so they can fix and retry easily
    return False

async def get_status(request):
    """Restituisce lo stato operativo dell'agente e i dettagli del sistema."""
    try:
        status_data = goodnotes_agent.get_agent_status()
        
        # Rileva se la chiave API è configurata
        api_key = os.environ.get("GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY") or ""
        has_key = bool(api_key)
        status_data["api_key_configured"] = has_key
        
        # Valida se la chiave è effettivamente funzionante
        is_valid = validate_gemini_key(api_key) if has_key else False
        status_data["api_key_valid"] = is_valid
        
        return JSONResponse(status_data)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def get_notebooks(request):
    """Elenca tutti i notebook Goodnotes disponibili in Risorse."""
    try:
        notebooks = goodnotes_agent.list_notebooks()
        return JSONResponse(notebooks)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def analyze_notebook(request):
    """Analizza le registrazioni audio presenti nel notebook specificato."""
    try:
        body = await request.json()
        notebook_name = body.get("notebook")
        if not notebook_name:
            return JSONResponse({"error": "Parametro 'notebook' mancante nel corpo della richiesta."}, status_code=400)
            
        analysis = goodnotes_agent.analyze_notebook_audios(notebook_name)
        return JSONResponse(analysis)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def export_notebook(request):
    """Esporta le registrazioni audio del notebook specificato."""
    try:
        body = await request.json()
        notebook_name = body.get("notebook")
        format_audio = body.get("format", "m4a")
        custom_export_dir = body.get("custom_export_dir")
        selected_uuids = body.get("selected_uuids")
        
        if not notebook_name:
            return JSONResponse({"error": "Parametro 'notebook' mancante nel corpo della richiesta."}, status_code=400)
            
        print(f"[*] Richiesta esportazione per notebook: {notebook_name} (Formato: {format_audio}, Percorso Personalizzato: {custom_export_dir}, Tracce Selezionate: {len(selected_uuids) if selected_uuids else 'Tutte'})")
        
        # Salva la mappatura in modo che l'agente la ricordi fissa
        if custom_export_dir:
            save_mapping(notebook_name, custom_export_dir)
            
        export_result = goodnotes_agent.export_notebook_audios(
            notebook_name, 
            format_audio=format_audio, 
            custom_export_dir=custom_export_dir,
            selected_uuids=selected_uuids
        )
        return JSONResponse({"result": export_result})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def get_icloud_files(request):
    """Scansiona la cartella genitore iCloud (e sue sottocartelle) alla ricerca di file .goodnotes o .zip pronti da importare."""
    try:
        mappings = load_mappings()
        saved_parent = mappings.get("__PARENT_SEARCH_DIR__")
        
        default_icloud = "/Users/mattiapinchera/Library/Mobile Documents/com~apple~CloudDocs/"
        default_uni = "/Users/mattiapinchera/Library/Mobile Documents/com~apple~CloudDocs/Università-Docs e Registrazioni"
        
        default_parent = default_uni if os.path.exists(default_uni) else default_icloud
        parent_dir = query_parent = request.query_params.get("parent_search_dir") or saved_parent or default_parent
        expanded_parent = os.path.abspath(os.path.expanduser(parent_dir))
        
        found_files = []
        
        if os.path.exists(expanded_parent) and os.path.isdir(expanded_parent):
            # Scansioniamo la cartella radice iCloud configurata
            for root, dirs, files in os.walk(expanded_parent):
                # Evitiamo di scansionare cartelle nascoste o di sistema
                dirs[:] = [d for d in dirs if not d.startswith('.')]
                for f in files:
                    if f.lower().endswith('.goodnotes'):
                        full_path = os.path.join(root, f)
                        # Calcoliamo il percorso relativo per display pulito
                        rel_path = os.path.relpath(full_path, expanded_parent)
                        size_mb = round(os.path.getsize(full_path) / (1024 * 1024), 2)
                        mtime = os.path.getmtime(full_path)
                        from datetime import datetime
                        found_files.append({
                            "name": f,
                            "relative_path": rel_path,
                            "absolute_path": full_path,
                            "size_mb": size_mb,
                            "modified": datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M')
                        })
        
        # Ordiniamo per data di modifica decrescente (più recenti prima)
        found_files.sort(key=lambda x: x["modified"], reverse=True)
        
        return JSONResponse({
            "files": found_files,
            "parent_dir": parent_dir
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def import_local_file(request):
    """Importa un file .goodnotes o .zip direttamente da un percorso locale assoluto (es. iCloud Drive)."""
    try:
        body = await request.json()
        file_path = body.get("file_path")
        
        if not file_path:
            return JSONResponse({"error": "Parametro 'file_path' mancante."}, status_code=400)
            
        expanded_path = os.path.abspath(os.path.expanduser(file_path))
        if not os.path.exists(expanded_path):
            return JSONResponse({"error": f"Il file specificato non esiste: {file_path}"}, status_code=404)
            
        # Importa scompattando e sovrascrivendo il vecchio folder
        import_result = goodnotes_agent.import_goodnotes(expanded_path)
        
        return JSONResponse({
            "success": True,
            "message": import_result
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def import_file(request):
    """Riceve un file .goodnotes o .zip tramite form upload e lo importa scompattandolo."""
    try:
        form = await request.form()
        uploaded_file = form.get("file")
        if not uploaded_file:
            return JSONResponse({"error": "Nessun file fornito nella richiesta."}, status_code=400)
            
        filename = uploaded_file.filename
        if not (filename.endswith(".goodnotes") or filename.endswith(".zip")):
            return JSONResponse({"error": "Il file caricato deve essere un archivio .goodnotes o .zip."}, status_code=400)
            
        # Crea la cartella scratch se non esiste
        scratch_dir = os.path.join(WORKSPACE_ROOT, "scratch")
        os.makedirs(scratch_dir, exist_ok=True)
        
        # Salva temporaneamente il file caricato
        temp_path = os.path.join(scratch_dir, filename)
        with open(temp_path, "wb") as f:
            f.write(await uploaded_file.read())
            
        # Esegue l'importazione (che scompatta e overwrita il vecchio folder!)
        import_result = goodnotes_agent.import_goodnotes(temp_path)
        
        # Rimuove il file compresso temporaneo
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
        return JSONResponse({
            "success": True, 
            "message": import_result
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def save_config(request):
    """Salva la GEMINI_API_KEY nel file local .env del workspace dopo averla convalidata."""
    try:
        body = await request.json()
        api_key = body.get("api_key", "").strip()
        
        if not api_key:
            return JSONResponse({"error": "Parametro 'api_key' vuoto o mancante."}, status_code=400)
            
        # Valida online la chiave API prima di procedere
        is_valid = validate_gemini_key(api_key)
        
        # Scrive o sovrascrive il file .env
        with open(ENV_FILE_PATH, 'w', encoding='utf-8') as env_file:
            env_file.write(f"GEMINI_API_KEY={api_key}\n")
            
        # Carica la chiave nell'ambiente corrente per renderla subito attiva
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

def clean_cache_dir():
    """Mantiene la dimensione della cache audio sotto i 50MB per non sprecare spazio disco."""
    cache_dir = os.path.join(WORKSPACE_ROOT, "scratch", "cache")
    if not os.path.exists(cache_dir):
        return
    try:
        files = [os.path.join(cache_dir, f) for f in os.listdir(cache_dir) if os.path.isfile(os.path.join(cache_dir, f))]
        total_size = sum(os.path.getsize(f) for f in files)
        MAX_CACHE_SIZE = 50 * 1024 * 1024 # 50 MB
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
        print(f"[!] Errore nella pulizia della cache audio: {e}")

async def play_audio_track(request):
    """Estrae on-the-fly una singola traccia audio dal file .goodnotes in iCloud e la streamma al browser."""
    try:
        notebook = request.query_params.get("notebook")
        uuid = request.query_params.get("uuid")
        
        if not notebook or not uuid:
            return JSONResponse({"error": "Parametri 'notebook' o 'uuid' mancanti."}, status_code=400)
            
        notebook_path = goodnotes_agent.resolve_notebook_path(notebook)
        if not notebook_path or not os.path.exists(notebook_path):
            return JSONResponse({"error": f"Notebook '{notebook}' non trovato in iCloud."}, status_code=404)
            
        cache_dir = os.path.join(WORKSPACE_ROOT, "scratch", "cache")
        os.makedirs(cache_dir, exist_ok=True)
        cached_file_path = os.path.join(cache_dir, f"{uuid}.m4a")
        
        if not os.path.exists(cached_file_path):
            with zipfile.ZipFile(notebook_path, 'r') as z:
                att_path = f"attachments/{uuid}"
                if att_path not in z.namelist():
                    return JSONResponse({"error": f"Traccia audio '{uuid}' non trovata nel notebook."}, status_code=404)
                
                with z.open(att_path) as src_f:
                    with open(cached_file_path, "wb") as dest_f:
                        shutil.copyfileobj(src_f, dest_f)
            
            clean_cache_dir()
            
        return FileResponse(cached_file_path, media_type="audio/mp4")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def serve_index(request):
    """Serve la pagina HTML del pannello di controllo front-end."""
    if not os.path.exists(INDEX_HTML_PATH):
        return HTMLResponse("<h1>index.html non trovato! Assicurati che sia posizionato nella root del workspace.</h1>", status_code=404)
        
    with open(INDEX_HTML_PATH, 'r', encoding='utf-8') as f:
        html_content = f.read()
    return HTMLResponse(html_content)

# ================================================================================
# INITIALIZATION & STARTUP
# ================================================================================

# Definizione delle rotte dell'applicazione
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

# Abilita il Middleware CORS per evitare problemi di sicurezza locali in sviluppo
middleware = [
    Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
]

app = Starlette(debug=True, routes=routes, middleware=middleware)

if __name__ == "__main__":
    print("=" * 80)
    print("      GOODNOTES AI AGENT - AVVIO DEL SERVER API LOCALE 🚀")
    print("=" * 80)
    print(f"[*] Root del workspace rilevata: {WORKSPACE_ROOT}")
    print("[*] Server in esecuzione su: http://localhost:8000")
    print("[*] Premi Ctrl+C per arrestare il server in qualsiasi momento.")
    print("-" * 80)
    
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
