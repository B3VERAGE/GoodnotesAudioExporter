# Backend Patterns & Concurrency Rules

## Asynchronous & Non-Blocking Guidelines

1. **CPU-Bound Offloading**:
   - Operations like `blackboxprotobuf.decode_message()`, deep varint parsing, or scanning ZIP directories across large iCloud folders must be executed off the main event loop via `asyncio.to_thread(sync_func, *args)`.
   - Never block Starlette's async request loop with synchronous file compression or parsing loops.

2. **In-Memory Caching (LRU)**:
   - Cache decoded Protobuf metadata by `(notebook_path, os.path.getmtime(notebook_path))` so repeated queries don't re-parse identical archives.
   - Invalidate cache entries automatically if `mtime` changes.

3. **Audio Streaming & Piping**:
   - For `/api/audio/play`, extract only the requested attachment UUID stream without inflating other files.
   - Use Starlette `FileResponse` with `media_type="audio/mp4"` or chunked stream generator.

4. **Modular Architecture Structure**:
   - `core/`: Data models, Protobuf decoding, cipher solvers (`caesar.py`, `unicode_math.py`).
   - `services/`: `icloud_scanner.py`, `audio_exporter.py`, `cache_manager.py`.
   - `api/`: `routes.py`, `middleware.py`, dependencies.
   - `config.py`: Dynamic paths (`WORKSPACE_ROOT`, `sys._MEIPASS`), port finder, environment loader.
