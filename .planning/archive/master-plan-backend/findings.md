# Findings & Discoveries — Backend Restructuring

## 1. Documenti iCloud Rilevati
- `AP1/AnatoPat.goodnotes` (307.5 MB) -> 17 tracce reali, 0 ghost.
- `Scienze Umane/Scienze umane.goodnotes` (496.5 MB) -> 27 tracce reali, 1 ghost.
- `Semeiotica/Semeiotica.goodnotes` (1089.3 MB) -> 31 tracce reali, 3 ghost.
- `PS1/Pato Sis.goodnotes` (1010.0 MB) -> 38 tracce reali, 3 ghost.
Totale tracce fisiche presenti nei 4 quaderni: 113.

## 2. Cause dei Bug Riscontrati
1. **Mancato ritrovamento registrazioni**:
   - `list_notebooks` includeva `.zip` arbitrari (`AP1 4:05.zip`, `AnatoPat_Audio.zip`) che fallivano durante l'analisi.
   - Directory con spazi finali (`audio non miei `) non venivano saltate dal filtro.
   - Mismatch NFD vs NFC su percorsi macOS contenenti lettere accentate (`Università-Docs e Registrazioni`).
   - Tracce con durata nanosecondi non valorizzata venivano eliminate dal check `duration != "N/A"`.
2. **Nomi alterati o lettere saltate**:
   - Falsi positivi in `is_caesar_encrypted` causati da sottostringhe corte (`tum`, `tir`, `morte`, `inizio`).
   - Lettere accentate italiane (`è` ord 232) corrotte da sottrazione `ord('a')` e modulo 26.
   - Distruzione degli acronimi medici (`ECG`, `BPCO`, `SCA`, `RCU`, `PAD`) a causa di `clean_name.title()`.
   - Sostituzioni hardcoded che cancellavano prefissi di materia (`CV: anuerismi` -> `Aneurismi`).
