#!/usr/bin/env python3
"""
================================================================================
Goodnotes AI Agent - macOS Native Desktop App Shell
================================================================================
Questo script avvia l'applicazione desktop nativa per Mac.
Coordina l'avvio in background del server API Starlette (tramite thread demone)
e apre in primo piano una finestra nativa macOS basata su WebKit (WKWebView).

Esecuzione:
   ./.venv/bin/python run_desktop_app.py
================================================================================
"""

import os
import sys
import uvicorn
import threading
import webview
import time

# Assicura che la directory del progetto sia nel path di importazione dei moduli
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
if hasattr(sys, '_MEIPASS'):
    sys.path.append(sys._MEIPASS)

# Carica l'applicazione Starlette esistente
from agent_server import app

import socket

def find_free_port() -> int:
    """Trova una porta TCP libera sul localhost, privilegiando la 8000 se disponibile."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('127.0.0.1', 8000))
            return 8000
        except OSError:
            pass
    
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def start_backend_server(port: int):
    """Avvia il server Starlette/Uvicorn in modalità silenziosa sulla porta specificata."""
    # Usiamo 127.0.0.1 per sicurezza e performance locali
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

if __name__ == "__main__":
    print("-" * 80)
    print("      GOODNOTES AI AGENT - AVVIO APPLICAZIONE DESKTOP NATIVA macOS 🖥️")
    print("-" * 80)
    print("[*] Root del workspace rilevata:", os.path.dirname(os.path.abspath(__file__)))
    
    # Rilevamento dinamico della porta
    port = find_free_port()
    print(f"[*] Avvio del server API locale in background sulla porta {port}...")
    
    # 1. Avvia il server backend in un thread separato contrassegnato come daemon
    server_thread = threading.Thread(target=start_backend_server, args=(port,), daemon=True)
    server_thread.start()
    
    # 2. Attende un attimo affinché il server si associ correttamente alla porta
    time.sleep(0.8)
    
    print("[*] Inizializzazione della finestra desktop nativa macOS...")
    print("[*] Nota: Chiudere la finestra terminerà automaticamente tutti i servizi dell'agente.")
    print("-" * 80)
    
    # 3. Crea la finestra nativa con pywebview (utilizza WKWebView nativo di macOS)
    # Dimensioni ideali (1280x850) per adattarsi magnificamente agli schermi Retina dei Mac
    window = webview.create_window(
        title="Goodnotes AI Agent",
        url=f"http://127.0.0.1:{port}",
        width=1280,
        height=850,
        resizable=True,
        min_size=(900, 600)
    )
    
    # 4. Avvia il loop dell'applicazione nativa desktop
    webview.start()
    
    print("[*] Applicazione desktop nativa macOS terminata correttamente.")
