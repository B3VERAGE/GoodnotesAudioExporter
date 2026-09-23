# Decoding Standards & Quality Gate Rules

## Protobuf & Audio Invariants

1. **Ghost Track Filtering**:
   - Goodnotes leaves historical events in `index.events.pb` even after recordings are deleted by the user.
   - Any audio attachment whose UUID is not physically present inside `attachments/<uuid>` of the ZIP MUST be dropped immediately from UI results. Never output 0 MB / "Mancante" entries.

2. **Creation Timestamp Precision**:
   - The primary source of truth for audio recording date is the MP4 `mvhd` box.
   - Read the first 256 KB of the attachment; parse version 0 (32-bit uint) or version 1 (64-bit uint) offset from Unix epoch (`- 2082844800`).
   - Fall back to ZIP entry `date_time` only if `mvhd` is unreadable.

3. **Title Decryption**:
   - Normalize mathematical bold/sans-serif Unicode glyphs to standard ASCII alphanumeric characters.
   - Detect and decipher Caesar shifts (+8 / +4) for obfuscated subject names.

## Quality Gate Checklist

Before delivering code changes:
- Run `python scratch/verify_decoding_robustness.py` against all detected iCloud notebooks.
- Expect 0 decoding errors and 100% verified tracks.
- Validate PyInstaller standalone spec if bundle entrypoint or dependencies changed.
