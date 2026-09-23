"""
================================================================================
Goodnotes 6 AI Audio Exporter - Starlette Server Factory & Runner
================================================================================
- Creazione app Starlette con CORS middleware completo.
- Negoziazione dinamica della porta TCP per prevenire conflitti (con fallback da 8000).
"""

import os
import uvicorn
from typing import Optional
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

from backend.config import find_free_port, WORKSPACE_ROOT
from backend.api.routes import routes

def create_app() -> Starlette:
    """Inizializza e restituisce l'applicazione Starlette configurata con tutte le rotte e middleware CORS."""
    middleware = [
        Middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"]
        )
    ]
    return Starlette(debug=True, routes=routes, middleware=middleware)

def run_server(host: str = "127.0.0.1", port: Optional[int] = None) -> None:
    """Avvia il server Uvicorn sulla porta specificata o trovata dinamicamente."""
    if port is None:
        env_port = os.environ.get("PORT")
        if env_port:
            try:
                port = int(env_port)
            except ValueError:
                port = find_free_port(8000)
        else:
            port = find_free_port(8000)

    print("=" * 80)
    print("      GOODNOTES AI AGENT - SERVER API ATTIVO (Backend v2.0) 🚀")
    print("=" * 80)
    print(f"[*] Workspace Root: {WORKSPACE_ROOT}")
    print(f"[*] Server in ascolto su: http://{host}:{port}")
    print("[*] Architettura: Starlette Asincrona + Zero-Space iCloud Streaming")
    print("-" * 80)

    app = create_app()
    uvicorn.run(app, host=host, port=port, log_level="info")

if __name__ == "__main__":
    run_server()
