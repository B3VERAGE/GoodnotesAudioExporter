"""
================================================================================
Goodnotes 6 AI Audio Exporter - Protobuf Metadata Decoder
================================================================================
Decodifica varint sicura e deserializzazione in-memory con blackboxprotobuf da
index.events.pb.
Zero-Space: elabora flussi binari senza estrarre archivi su disco.
Nessuna traccia scartata: se la durata non è in Protobuf, viene preservata per
il parsing MP4.
"""

import io
import re
from typing import Optional, Dict, Any, Union
import blackboxprotobuf

from backend.core.title_cleaner import clean_title

UUID_REGEX = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')

def read_varint(stream: io.IOBase) -> Optional[int]:
    """Legge un intero con codifica Protobuf Varint a 64-bit con limite di sicurezza anti-loop."""
    value = 0
    shift = 0
    while True:
        b = stream.read(1)
        if not b:
            return None
        byte = b[0]
        value |= (byte & 0x7F) << shift
        if not (byte & 0x80):
            break
        shift += 7
        if shift > 64:  # Previene loop infiniti su dati corrotti
            return None
    return value

def clean_val(val: Any) -> str:
    """Sanitizza valori generici estratti da blackboxprotobuf in stringhe pulite."""
    if isinstance(val, bytes):
        return val.decode('utf-8', errors='ignore').strip()
    elif isinstance(val, str):
        return val.strip()
    return str(val) if val is not None else ""

def format_duration_ns(nanosecs: Optional[Union[int, float]]) -> Optional[str]:
    """Formatta nanosecondi Protobuf in formato leggibile (es. '1h 20m 00s')."""
    if not isinstance(nanosecs, (int, float)) or nanosecs <= 0:
        return None
    total_seconds = int(nanosecs // 1_000_000_000)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    if hours > 0:
        return f"{hours}h {minutes:02d}m {seconds:02d}s"
    return f"{minutes}m {seconds:02d}s"

def is_valid_title(val: str) -> bool:
    """Verifica se una stringa estratta rappresenta un titolo plausibile e non un identificatore di sistema."""
    if not isinstance(val, str):
        return False
    val_strip = val.strip()
    if len(val_strip) < 3:
        return False
    if UUID_REGEX.match(val_strip):
        return False
    if re.search(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', val_strip):
        return False
    system_patterns = [
        r'^_standard_', r'^it_IT', r'^en_US', r'^[a-zA-Z0-9]{32}$', r'^standard_',
        r'^Blue$', r'^White$', r'^attachments/', r'^notes/', r'^search/', r'^[0-9]+$'
    ]
    for sp in system_patterns:
        if re.search(sp, val_strip, re.IGNORECASE):
            return False
    return True

def extract_events_mapping(events_pb_source: Union[bytes, str, io.IOBase]) -> Dict[str, Dict[str, Any]]:
    """
    Estrae la mappatura delle registrazioni da index.events.pb in memoria.
    Mappa session_to_attachment, session_to_title e session_to_duration.
    
    REGOLA CHIAVE: Le registrazioni prive di durata in Protobuf NON vengono scartate!
    Vengono restituite con duration=None cosicché l'analizzatore MP4 possa colmare
    il metadato dal box mvhd.
    """
    session_to_attachment: Dict[str, str] = {}
    session_to_title: Dict[str, str] = {}
    session_to_duration_formatted: Dict[str, str] = {}
    session_to_duration_ns: Dict[str, int] = {}

    if isinstance(events_pb_source, bytes):
        stream = io.BytesIO(events_pb_source)
    elif isinstance(events_pb_source, str):
        try:
            with open(events_pb_source, 'rb') as f:
                stream = io.BytesIO(f.read())
        except Exception:
            return {}
    elif isinstance(events_pb_source, io.IOBase):
        stream = events_pb_source
    else:
        return {}

    while True:
        length = read_varint(stream)
        if length is None:
            break
        msg_bytes = stream.read(length)
        if len(msg_bytes) < length:
            break

        try:
            decoded_msg, _ = blackboxprotobuf.decode_message(msg_bytes)

            # Evento tipo 160: associazione Sessione <-> Allegato & Durata
            if '160' in decoded_msg and isinstance(decoded_msg['160'], dict):
                f160 = decoded_msg['160']
                s_id = clean_val(f160.get('1'))
                att_id = clean_val(f160.get('2'))
                duration_ns = f160.get('4')

                if s_id and att_id:
                    s_id_up = s_id.upper()
                    att_id_up = att_id.upper()
                    session_to_attachment[s_id_up] = att_id_up
                    if duration_ns:
                        fmt = format_duration_ns(duration_ns)
                        if fmt:
                            session_to_duration_formatted[s_id_up] = fmt
                            session_to_duration_ns[s_id_up] = duration_ns

            # Evento tipo 164: associazione Sessione <-> Titolo
            if '164' in decoded_msg and isinstance(decoded_msg['164'], dict):
                f164 = decoded_msg['164']
                s_id = clean_val(f164.get('1'))
                f3 = f164.get('3')
                title = None
                if isinstance(f3, dict):
                    title = f3.get('1')

                if s_id and title and isinstance(title, (str, bytes)):
                    session_to_title[s_id.upper()] = clean_val(title)
                elif s_id:
                    # Fallback euristico su stringhe UTF-8 valide nel messaggio
                    raw_strings = re.findall(rb'[\x20-\x7E\xC2-\xF4][\x20-\x7E\x80-\xBF]{2,99}', msg_bytes)
                    for rs in raw_strings:
                        try:
                            val_str = rs.decode('utf-8').strip()
                            if is_valid_title(val_str):
                                session_to_title[s_id.upper()] = val_str
                                break
                        except Exception:
                            pass
        except Exception:
            pass

    # Assemblaggio dizionario indicizzato per UUID allegato (in maiuscolo)
    mappa_audio: Dict[str, Dict[str, Any]] = {}
    for s_id, att_uuid in session_to_attachment.items():
        raw_title = session_to_title.get(s_id, "Registrazione Senza Nome")
        duration_fmt = session_to_duration_formatted.get(s_id)
        duration_raw = session_to_duration_ns.get(s_id)

        mappa_audio[att_uuid] = {
            "uuid": att_uuid,
            "session_id": s_id,
            "raw_title": raw_title,
            "title": clean_title(raw_title),
            "duration": duration_fmt,  # Può essere None se non presente in Protobuf
            "duration_ns": duration_raw,
            "date": "N/A"
        }

    return mappa_audio
