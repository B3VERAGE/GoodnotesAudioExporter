---
name: resume
description: "Ripresa di una sessione con quadro completo: legge in automatico AGENTS.md, MEMORY.md e i file di planning-with-files (task_plan.md, findings.md, progress.md) dell'ultimo piano attivo, presentando stato, scoperte e prossimi passi prima di toccare il codice."
argument-hint: "Opzionale: argomento su cui vuoi riprendere"
category: "productivity"
risk: "safe"
source: "local"
date_added: "2026-08-10"
author: "Mattia Pinchera"
tools:
  - opencode
  - antigravity
tags:
  - productivity
  - workflow
  - memory
  - resume
  - bootstrap
  - planning
---

# Resume — ripresa completa della sessione

Quando l'utente digita `/resume`, esegui questi passaggi nell'ordine.
L'obiettivo è dare all'agente il **quadro completo a 360°** su regole di progetto, memoria storica e avanzamento del lavoro corrente, prima di toccare qualsiasi file di codice.

---

## 1. Leggi le istruzioni del progetto (`AGENTS.md`)

Verifica se nella radice del progetto o in `.agents/` esiste un file di istruzioni (`AGENTS.md` o `agents.md`).

- **Se esiste e non è già nel contesto**: **leggilo subito in automatico**.
  Assimila le regole operative, i vincoli architetturali, lo stack tecnologico e le convenzioni richieste dal repository. Sono vincolanti per tutta la sessione.
  Non serve riscriverne il testo all'utente.
- **Se non esiste**: procedi senza bloccarti.

---

## 2. Leggi la memoria a lungo termine (`MEMORY.md`)

Cerca `MEMORY.md` nella radice del progetto corrente (`$PWD/MEMORY.md`).

- **Se esiste**: leggilo per riprendere stato globale, fatti permanenti, decisioni architetturali durature e bug noti.
- **Se non esiste**: segnalalo in una riga (*"nessuna memoria a lungo termine trovata; potrai crearla con `/handoff` a fine sessione"*).

Se l'utente ha specificato un argomento (`/resume deploy`), cerca anche nelle altre memorie della macchina:
`~/.memory/bin/mem search <argomento>`.

---

## 2-bis. Leggi la Macro-Roadmap di Progetto (`MASTER_PLAN.md`)

Verifica se nella radice del progetto esiste `MASTER_PLAN.md` (generato da `master-project-planner`).

- **Se esiste**:
  - Leggilo per estrarre la visione d'insieme strategica:
    - **Milestone attiva** e avanzamento complessivo (es. *Milestone 1: 2/4 task completati*).
    - Il prossimo task macro pianificato e la relativa **Definition of Done (DoD)**.
    - Presenza di Audit Gates pendenti (`Task X.Final`).
  - Nota: `MASTER_PLAN.md` è la **Single Source of Truth (SSOT)** dell'intero progetto.
- **Se non esiste**: procedi normalmente.

---

## 3. Leggi il piano di lavoro e i dettagli (`planning-with-files`)

Individua il piano di lavoro attivo o più recente per sapere esattamente cosa è stato fatto e dove ci si è fermati.

### Come individuare la cartella del piano:
1. Controlla la variabile `$PLAN_ID` se impostata.
2. Controlla `.planning/.active_plan` nella radice del progetto se esiste e contiene il nome della cartella del piano.
3. Se `.active_plan` non c'è o è vuoto, cerca la sottocartella più recente in `.planning/*/` che contenga `task_plan.md` (escludendo `.planning/archive/`).
4. Fallback: controlla se c'è un `task_plan.md` direttamente nella radice del progetto.

### Cosa leggere dal piano:
Se una cartella di piano (o file root) viene individuata:
- **`task_plan.md`**: leggilo per conoscere l'obiettivo del task, lo stato di tutte le fasi (`complete`, `in_progress`, `pending`), le decisioni prese e il passo successivo (`## Next Step`).
- **`findings.md`** (se presente): leggilo per essere al corrente di tutte le scoperte, vincoli di backend/API, ricerche e dettagli investigativi emersi.
- **`progress.md`** (se presente): leggilo (in particolare le sessioni recenti in coda) per sapere esattamente quali comandi sono stati eseguiti, quali test hanno avuto successo e quali errori sono già stati gestiti.

Se non esiste alcun piano attivo o pregresso, prosegui basandoti unicamente su `MEMORY.md`.

---

## 3-bis. Controlla lo stato del Version Control (se è un repository Git)

Verifica se nella radice del progetto esiste la directory `.git/`.

- **Se `.git/` esiste**:
  Esegui un'ispezione non distruttiva dello stato del repository:
  1. **Branch e ultimo commit**:
     ```bash
     git branch --show-current && git log -1 --oneline
     ```
  2. **Modifiche pendenti o unstaged**:
     ```bash
     git status --short
     ```
  3. **Allineamento remoto**:
     Controlla se il branch locale è allineato con il remote configurato (es. `origin`).
     Se ci sono modifiche non committate da una sessione precedente o interrotta, **segnalalo esplicitamente all'utente** prima di iniziare qualsiasi nuovo lavoro.
- **Se `.git/` non esiste**:
  Salta il passaggio in modo trasparente e silenzioso, senza generare errori o alert.

---

## 4. Presenta il contesto all'utente

Formatta la risposta in modo chiaro, ordinato e sintetico, confermando le fonti caricate:

```
🎯 <stato attuale e avanzamento dell'ultimo task in 2-3 frasi>

📜 Contesto caricato:
- Regole: [AGENTS.md trovato e assimilato | non presente]
- Memoria: [MEMORY.md letto | nessuna memoria]
- Macro-Roadmap: [MASTER_PLAN.md — Milestone X (Y/Z task completati) | non presente]
- Micro-Piano attivo: [slug piano — task/step n/tot (in corso) | nessun piano attivo]
- Git: [branch <nome> @ <hash> — working tree pulito / X modifiche pendenti | non applicabile (progetto non Git)]

🧠 Fatti e scoperte chiave:
- <2-4 punti salienti integrando fatti permanenti da MEMORY.md e scoperte recenti da findings.md/progress.md>

📋 Prossimi passi:
1. <primo passo, allineato a Next Step del piano attivo se presente>
2. <secondo passo>
3. <terzo passo>

Da quale vuoi iniziare?
```

---

## 5. Aspetta la decisione dell'utente

**Non aprire file di codice sorgente, non eseguire modifiche e non lanciare comandi** finché l'utente non ha scelto quale task affrontare.
La lettura iniziale di `AGENTS.md`, `MEMORY.md`, `task_plan.md`, `findings.md` e `progress.md` è l'unica consentita all'avvio, perché costituisce il contesto operativo dell'agente.

Quando l'utente seleziona il passo da cui partire, apri **solo** i file necessari per quel compito.
