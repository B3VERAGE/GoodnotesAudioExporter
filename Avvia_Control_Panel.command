#!/bin/bash
# ================================================================================
# Goodnotes AI Agent - macOS Native Desktop Launcher
# ================================================================================
# Fai doppio clic su questo file nel Finder per avviare l'applicazione desktop nativa.
# ================================================================================

# Si sposta dinamicamente nella cartella contenente lo script launcher
cd "$(dirname "$0")"

# Visualizza un titolo pulito e professionale nel terminale Mac
echo "================================================================================"
# Inizializza l'applicazione desktop nativa macOS
echo "          AVVIO GOODNOTES AI AGENT - APPLICAZIONE DESKTOP NATIVA macOS 🖥️"
echo "================================================================================"
echo "[*] Percorso applicazione: $(pwd)"
echo "[*] Inizializzazione della finestra desktop locale WKWebView..."
echo "[*] Nota: Chiudere la finestra dell'applicazione arresterà tutti i servizi."
echo "================================================================================"

# Avvia l'applicazione desktop nativa usando l'ambiente virtuale locale isolato
./.venv/bin/python run_desktop_app.py
