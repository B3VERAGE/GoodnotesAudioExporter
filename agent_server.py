#!/usr/bin/env python3
"""
================================================================================
Goodnotes AI Agent - Local API Server Bridge
================================================================================
Bridge snello che invoca il backend modulare v2.0 (backend.api.server).
Mantiene la piena retro-compatibilità con 'run_desktop_app.py' (from agent_server import app).
"""

import os
import sys

# Assicura che la root del workspace sia nel path di ricerca moduli
WORKSPACE_ROOT = os.path.dirname(os.path.abspath(__file__))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

from backend.api.server import create_app, run_server

# Istanza per PyWebView / run_desktop_app.py
app = create_app()

if __name__ == "__main__":
    run_server()
