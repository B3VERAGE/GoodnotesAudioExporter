"""
================================================================================
Goodnotes 6 AI Audio Exporter - MP4 / M4A Atom Parser (In-Memory mvhd)
================================================================================
Lettura atomica in-memory dei primi 256 KB dell'allegato audio per estrarre:
1. Timestamp di creazione originale dal box 'mvhd' (version 0 e 1, offset -2082844800).
2. Timescale e duration per calcolare la durata audio esatta se assente in Protobuf.
Zero-Space: non estrae mai file temporanei su disco.
"""

import io
import struct
from datetime import datetime
from typing import Optional, Dict, Any, Union

# Costante offset secondi tra 1 gennaio 1904 (Mac epoch) e 1 gennaio 1970 (Unix epoch)
# 66 anni (inclusi 17 anni bisestili) = 24.107 giorni * 86.400 = 2.082.844.800 secondi
MAC_TO_UNIX_OFFSET = 2082844800

def format_duration_seconds(seconds_total: Optional[float]) -> str:
    """Formatta i secondi in formato human-readable (es. '1h 05m 23s' o '45m 12s')."""
    if seconds_total is None or seconds_total <= 0:
        return "N/A"
    sec = int(round(seconds_total))
    hours = sec // 3600
    minutes = (sec % 3600) // 60
    seconds = sec % 60
    if hours > 0:
        return f"{hours}h {minutes:02d}m {seconds:02d}s"
    return f"{minutes}m {seconds:02d}s"

def parse_mvhd_bytes(data: bytes) -> Dict[str, Any]:
    """
    Scansiona i byte in memoria alla ricerca del box 'mvhd'.
    Restituisce un dizionario con creazione (datetime e unix), durata e timescale.
    """
    result: Dict[str, Any] = {
        "creation_time": None,
        "unix_timestamp": None,
        "timescale": None,
        "duration_units": None,
        "duration_seconds": None,
        "duration_formatted": "N/A",
    }

    if not data:
        return result

    idx = data.find(b'mvhd')
    if idx == -1:
        return result

    # La signature 'mvhd' è a idx, seguita da 1 byte version e 3 bytes flags
    if len(data) < idx + 8:
        return result

    version = data[idx + 4]

    try:
        if version == 0:
            # Version 0: campi a 32-bit big-endian
            # idx + 8: creation_time (4B)
            # idx + 12: modification_time (4B)
            # idx + 16: timescale (4B)
            # idx + 20: duration (4B)
            if len(data) >= idx + 24:
                creation_time_raw = struct.unpack('>I', data[idx + 8 : idx + 12])[0]
                timescale = struct.unpack('>I', data[idx + 16 : idx + 20])[0]
                duration = struct.unpack('>I', data[idx + 20 : idx + 24])[0]
            else:
                return result
        elif version == 1:
            # Version 1: campi a 64-bit big-endian (tranne timescale a 32-bit)
            # idx + 8: creation_time (8B)
            # idx + 16: modification_time (8B)
            # idx + 24: timescale (4B)
            # idx + 28: duration (8B)
            if len(data) >= idx + 36:
                creation_time_raw = struct.unpack('>Q', data[idx + 8 : idx + 16])[0]
                timescale = struct.unpack('>I', data[idx + 24 : idx + 28])[0]
                duration = struct.unpack('>Q', data[idx + 28 : idx + 36])[0]
            else:
                return result
        else:
            return result

        # Calcolo data creazione reale
        if creation_time_raw and creation_time_raw > MAC_TO_UNIX_OFFSET:
            unix_time = creation_time_raw - MAC_TO_UNIX_OFFSET
            # Sanity check: compreso tra anno 2000 (946684800) e anno 2040 (2208988800)
            if 946684800 <= unix_time <= 2208988800:
                result["unix_timestamp"] = float(unix_time)
                result["creation_time"] = datetime.fromtimestamp(unix_time).astimezone()

        # Calcolo durata reale
        if timescale and timescale > 0:
            result["timescale"] = timescale
            result["duration_units"] = duration
            duration_sec = duration / timescale
            result["duration_seconds"] = duration_sec
            result["duration_formatted"] = format_duration_seconds(duration_sec)

    except Exception:
        pass

    return result

def parse_mvhd_from_stream(stream: io.IOBase, max_bytes: int = 262144) -> Dict[str, Any]:
    """
    Legge il box mvhd dallo stream.
    Tenta prima sui primi 256 KB (head). Se non trovato e lo stream supporta seek,
    esamina l'ultimo 1.5 MB (tail), poiché i file audio registrati su iOS/macOS
    spesso contengono l'atomo moov/mvhd alla fine del file dopo l'mdat.
    """
    # 1. Prova dall'inizio (head)
    head_data = stream.read(max_bytes)
    res = parse_mvhd_bytes(head_data)
    if res.get("creation_time") is not None:
        return res

    # 2. Se non trovato e lo stream supporta seek, cerca negli ultimi 1.5 MB (tail)
    if stream.seekable():
        try:
            stream.seek(0, io.SEEK_END)
            total_size = stream.tell()
            tail_size = min(total_size, 1572864)  # 1.5 MB
            if tail_size > 0:
                stream.seek(-tail_size, io.SEEK_END)
                tail_data = stream.read(tail_size)
                res_tail = parse_mvhd_bytes(tail_data)
                if res_tail.get("creation_time") is not None:
                    return res_tail
        except Exception:
            pass

    return res

