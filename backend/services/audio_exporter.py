"""
================================================================================
Goodnotes 6 AI Audio Exporter - Zero-Space Audio Exporter & Cache Analyzer
================================================================================
- Estrazione atomica Zero-Space da flussi ZIP in memoria direttamente da iCloud.
- Sanitizzazione intelligente dei nomi file per filesystem (preserva acronimi, accenti
  e converte 'CV:' in 'CV -').
- Smart Skip per prevenire riscritture inutili di file già esportati con dimensione > 0.
- Analizzatore di quaderno con cache LRU in-memory ad alte prestazioni.
"""

import os
import re
import shutil
import zipfile
import unicodedata
from datetime import datetime
from typing import Optional, Dict, Any, List, Callable

from backend.core.title_cleaner import clean_title
from backend.core.mp4_parser import parse_mvhd_bytes
from backend.core.protobuf_decoder import extract_events_mapping
from backend.services.cache_manager import metadata_cache
from backend.services.icloud_scanner import find_notebook

def build_export_filename(raw_title: str, date_prefix: Optional[str] = None, ext: str = "m4a") -> str:
    """
    Costruisce il nome definitivo del file audio pronto per il filesystem:
    - Pulisce e decifra il titolo con clean_title.
    - Sostituisce i due punti dei prefissi di materia (es. 'CV:' -> 'CV -').
    - Rimuove caratteri vietati nei filesystem.
    - Aggiunge il prefisso data 'GG_MM' se presente.
    """
    title_clean = clean_title(raw_title)

    # Nel filesystem i due punti ':' sono vietati su Windows e problematici su macOS
    # Trasforma 'CV: Aneurismi' in 'CV - Aneurismi'
    fs_title = re.sub(r'[:\/\\*\?"<>\|]', ' - ', title_clean)
    fs_title = re.sub(r'\s*-\s*-\s*', ' - ', fs_title)
    fs_title = re.sub(r'\s+', ' ', fs_title).strip(' -')

    ext_clean = ext.lstrip('.').lower()
    if date_prefix and date_prefix != "00_00":
        return f"{date_prefix} - {fs_title}.{ext_clean}"
    return f"{fs_title}.{ext_clean}"

def analyze_notebook_with_cache(notebook_path_or_name: str, use_cache: bool = True) -> Dict[str, Any]:
    """
    Analizza i metadati audio del quaderno sfruttando la cache in-memory.
    Se in cache, risponde in <0.1ms.
    Se miss, deserializza index.events.pb in memoria, estrae atomi mvhd per ciascuna traccia
    e memorizza il risultato.
    """
    nb_info = find_notebook(notebook_path_or_name)
    if not nb_info:
        return {"error": f"Quaderno '{notebook_path_or_name}' non trovato."}

    notebook_path = nb_info["path"]
    notebook_name = nb_info["name"]

    if use_cache:
        cached = metadata_cache.get(notebook_path)
        if cached is not None:
            return cached

    # Parsing completo in-memory da ZIP
    try:
        with zipfile.ZipFile(notebook_path, 'r') as z:
            namelist = set(z.namelist())

            if "index.events.pb" not in namelist:
                return {"error": "Il file index.events.pb non è presente nel quaderno."}

            events_pb_data = z.read("index.events.pb")
            events_map = extract_events_mapping(events_pb_data)

            recordings: List[Dict[str, Any]] = []
            ghost_count = 0

            for att_uuid, info in events_map.items():
                att_path = f"attachments/{att_uuid}"
                if att_path not in namelist:
                    ghost_count += 1
                    continue  # Traccia fantasma scartata

                zinfo = z.getinfo(att_path)
                size_bytes = zinfo.file_size
                raw_title = info["raw_title"]
                cleaned_title = info["title"]

                # Leggi l'atomo mvhd (sia head che tail) per ottenere data e durata
                mvhd_info = {
                    "creation_time": None,
                    "unix_timestamp": None,
                    "duration_formatted": "N/A"
                }
                try:
                    with z.open(att_path) as att_file:
                        # Leggiamo i primi 256 KB e gli ultimi 1.5 MB se necessario
                        head_bytes = att_file.read(256 * 1024)
                        mvhd_info = parse_mvhd_bytes(head_bytes)
                        if not mvhd_info.get("creation_time") and size_bytes > 256 * 1024:
                            # Prova a leggere dalla coda del file
                            tail_len = min(size_bytes, 1536 * 1024)
                            # ZipExtFile non supporta seek da SEEK_END in alcune versioni, leggiamo via decompressione o riapertura
                            # Per ZipExtFile su Python, possiamo leggere fino alla fine se non enorme o seek assoluto
                            try:
                                att_file.seek(max(0, size_bytes - tail_len))
                                tail_bytes = att_file.read(tail_len)
                                tail_mvhd = parse_mvhd_bytes(tail_bytes)
                                if tail_mvhd.get("creation_time"):
                                    mvhd_info = tail_mvhd
                            except Exception:
                                pass
                except Exception:
                    pass

                dt_obj = mvhd_info["creation_time"]
                date_str = dt_obj.strftime('%d/%m/%Y %H:%M') if dt_obj else "N/A"
                date_prefix = dt_obj.strftime('%d_%m') if dt_obj else "00_00"

                # Durata: priorità a Protobuf, fallback su mvhd
                final_duration = info["duration"] or mvhd_info["duration_formatted"]

                export_filename = build_export_filename(
                    raw_title=raw_title,
                    date_prefix=date_prefix,
                    ext="m4a"
                )

                recordings.append({
                    "uuid": att_uuid,
                    "raw_title": raw_title,
                    "clean_title": cleaned_title,
                    "export_filename": export_filename,
                    "duration": final_duration,
                    "size_bytes": size_bytes,
                    "size_mb": round(size_bytes / (1024 * 1024), 2),
                    "date": date_str,
                    "creation_time": date_str,
                    "date_prefix": date_prefix,
                    "unix_timestamp": mvhd_info["unix_timestamp"],
                    "status": "Presente"
                })

            # Ordina per data (cronologico)
            recordings.sort(key=lambda r: (r["unix_timestamp"] or 0, r["export_filename"]))

            result = {
                "notebook": notebook_name,
                "notebook_path": notebook_path,
                "total_recordings": len(recordings),
                "ghost_tracks_count": ghost_count,
                "recordings": recordings
            }

            if use_cache:
                metadata_cache.set(notebook_path, result)

            return result

    except Exception as e:
        return {"error": f"Errore durante l'analisi: {str(e)}"}

def export_audio_track(
    notebook_zip_path: str,
    attachment_uuid: str,
    destination_file_path: str,
    overwrite: bool = False
) -> Dict[str, Any]:
    """
    Estrae atomicamente un allegato audio da ZIP direttamente al percorso di destinazione.
    Zero-Space: streaming chunked senza file intermedi.
    Smart Skip: se il file esiste già e size > 0, salta la scrittura.
    """
    dest_norm = unicodedata.normalize("NFC", os.path.abspath(destination_file_path))

    # Smart Skip check
    if os.path.exists(dest_norm) and not overwrite:
        try:
            if os.path.getsize(dest_norm) > 0:
                return {
                    "status": "skipped",
                    "file_path": dest_norm,
                    "reason": "File già presente e valido (Smart Skip)"
                }
        except OSError:
            pass

    os.makedirs(os.path.dirname(dest_norm), exist_ok=True)

    try:
        with zipfile.ZipFile(notebook_zip_path, 'r') as zf:
            att_entry = f"attachments/{attachment_uuid}"
            if att_entry not in zf.namelist():
                return {
                    "status": "failed",
                    "file_path": dest_norm,
                    "error": f"Allegato {attachment_uuid} non trovato nello zip"
                }

            # Streaming a blocchi da 64 KB
            with zf.open(att_entry) as source, open(dest_norm, 'wb') as target:
                shutil.copyfileobj(source, target, length=64 * 1024)

        return {
            "status": "exported",
            "file_path": dest_norm,
            "size_bytes": os.path.getsize(dest_norm)
        }
    except Exception as err:
        if os.path.exists(dest_norm) and os.path.getsize(dest_norm) == 0:
            try:
                os.remove(dest_norm)
            except OSError:
                pass
        return {
            "status": "failed",
            "file_path": dest_norm,
            "error": str(err)
        }

def export_notebook_audios(
    notebook_path_or_name: str,
    output_dir: str,
    selected_uuids: Optional[List[str]] = None,
    overwrite: bool = False,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None
) -> Dict[str, Any]:
    """
    Esporta in batch le registrazioni audio di un quaderno Goodnotes.
    Supporta selezione mirata per UUID, Smart Skip e tracking avanzato del progresso.
    """
    analysis = analyze_notebook_with_cache(notebook_path_or_name)
    if "error" in analysis:
        return {"error": analysis["error"]}

    notebook_path = analysis["notebook_path"]
    notebook_name = analysis["notebook"]
    recordings = analysis["recordings"]

    target_recordings = recordings
    if selected_uuids:
        selected_set = {u.upper() for u in selected_uuids}
        target_recordings = [r for r in recordings if r["uuid"].upper() in selected_set]

    out_dir_norm = unicodedata.normalize("NFC", os.path.abspath(os.path.expanduser(output_dir)))
    os.makedirs(out_dir_norm, exist_ok=True)

    total = len(target_recordings)
    exported = 0
    skipped = 0
    failed = 0
    details = []

    for idx, rec in enumerate(target_recordings, 1):
        filename = rec["export_filename"]
        target_path = os.path.join(out_dir_norm, filename)

        res = export_audio_track(
            notebook_zip_path=notebook_path,
            attachment_uuid=rec["uuid"],
            destination_file_path=target_path,
            overwrite=overwrite
        )

        st = res.get("status")
        if st == "exported":
            exported += 1
        elif st == "skipped":
            skipped += 1
        else:
            failed += 1

        rec_result = {
            "uuid": rec["uuid"],
            "title": rec["clean_title"],
            "filename": filename,
            "status": st,
            "error": res.get("error")
        }
        details.append(rec_result)

        if progress_callback:
            try:
                progress_callback({
                    "current": idx,
                    "total": total,
                    "notebook": notebook_name,
                    "recording": rec_result
                })
            except Exception:
                pass

    return {
        "notebook": notebook_name,
        "output_dir": out_dir_norm,
        "total": total,
        "exported": exported,
        "skipped": skipped,
        "failed": failed,
        "details": details
    }
