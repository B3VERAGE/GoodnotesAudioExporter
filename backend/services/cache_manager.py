"""
================================================================================
Goodnotes 6 AI Audio Exporter - Thread-Safe In-Memory Cache Manager
================================================================================
Gestore di caching in-memory thread-safe con threading.Lock.
Associa a ogni quaderno la firma (canonical_path, file_mtime, file_size).
Invalida automaticamente se il file cambia su iCloud e risponde in <0.1ms.
"""

import os
import threading
import unicodedata
from typing import Dict, Any, Optional, Tuple

class CacheManager:
    """
    Gestore di cache in-memory thread-safe per metadati audio decodificati.
    """
    def __init__(self, max_entries: int = 128):
        self._lock = threading.Lock()
        self._max_entries = max_entries
        # Chiave: canonical_path -> ((mtime, size), data)
        self._cache: Dict[str, Tuple[Tuple[float, int], Any]] = {}

    def _get_file_signature(self, path: str) -> Optional[Tuple[float, int]]:
        """Calcola la firma di validità (mtime, size) del file su disco."""
        try:
            norm_path = unicodedata.normalize("NFC", os.path.abspath(path))
            if not os.path.exists(norm_path):
                norm_path = unicodedata.normalize("NFD", norm_path)
                if not os.path.exists(norm_path):
                    return None
            stat = os.stat(norm_path)
            return (stat.st_mtime, stat.st_size)
        except (OSError, IOError):
            return None

    def get(self, path: str) -> Optional[Any]:
        """Restituisce il valore in cache se la firma corrisponde al file su disco."""
        canonical_path = unicodedata.normalize("NFC", os.path.abspath(path))
        sig = self._get_file_signature(canonical_path)
        if not sig:
            return None

        with self._lock:
            entry = self._cache.get(canonical_path)
            if entry is not None:
                cached_sig, cached_data = entry
                if cached_sig == sig:
                    return cached_data
                # Invalida se la firma su disco è cambiata
                del self._cache[canonical_path]
        return None

    def set(self, path: str, data: Any) -> None:
        """Salva i dati in cache associati alla firma corrente del file."""
        canonical_path = unicodedata.normalize("NFC", os.path.abspath(path))
        sig = self._get_file_signature(canonical_path)
        if not sig:
            return

        with self._lock:
            if len(self._cache) >= self._max_entries:
                first_key = next(iter(self._cache))
                del self._cache[first_key]
            self._cache[canonical_path] = (sig, data)

    def invalidate(self, path: str) -> bool:
        """Invalida manualmente la voce associata a un percorso."""
        canonical_path = unicodedata.normalize("NFC", os.path.abspath(path))
        with self._lock:
            return self._cache.pop(canonical_path, None) is not None

    def clear(self) -> None:
        """Svuota completamente la cache in-memory."""
        with self._lock:
            self._cache.clear()

    @property
    def size(self) -> int:
        """Restituisce il numero di quaderni memorizzati in cache."""
        with self._lock:
            return len(self._cache)

# Istanza globale singleton
metadata_cache = CacheManager()
