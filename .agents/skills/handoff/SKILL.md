---
name: handoff
description: "Chiusura di sessione, un comando solo: allinea il piano di lavoro in .planning/, aggiorna il MEMORY.md del progetto SE è emerso qualcosa di duraturo, e archivia il piano se tutte le fasi sono complete. Decide da sé cosa serve: l'utente digita /handoff e basta."
argument-hint: "Focus opzionale del salvataggio (es. autenticazione, deploy)"
disable-model-invocation: true
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
  - handoff
  - checkpoint
---

# Handoff — chiusura di sessione

Quando l'utente digita `/handoff` o `/checkpoint`, esegui questi passaggi nell'ordine.
La memoria è **un file di testo**: non ci sono servizi da contattare, code o database.

**L'utente digita `/handoff` e basta.** Non deve dirti se allineare il piano, se scrivere
in `MEMORY.md` o se archiviare: lo decidi tu qui sotto, perché hai già tutto per farlo.
Non chiedergli di scegliere e non trattare come fallimento un handoff che lascia
`MEMORY.md` intatto — è il caso normale di una sessione in cui si è solo avanzato.

---

## 1. Individua il file di memoria

È `MEMORY.md` nella radice del progetto corrente (`$PWD/MEMORY.md`).

- Esiste → è il candidato da aggiornare al punto 2.
- **Non esiste → non crearlo ancora.** Crealo al punto 2, e solo se lì decidi che c'è
  qualcosa di duraturo da scriverci — altrimenti resterebbe un file di segnaposto vuoto,
  peggio che nessun file. Quando serve, un solo comando fa tutto (crea dal template e
  collega la memoria all'indice globale), **senza chiedere conferma**:
  ```bash
  ~/.memory/bin/mem new "$PWD"
  ```
  Poi riempi le sezioni sostituendo i segnaposto `<...>` del template.

Se la cwd non è la radice del progetto (sei in una sottocartella), risali fino alla
directory che contiene `.git/`, `package.json` o simili. Nel dubbio **chiedi all'utente**.

---

## 1-bis. Allinea il piano di lavoro, se c'è

Se il progetto ha un piano attivo (`.planning/.active_plan` → `.planning/<slug>/`,
oppure un `task_plan.md` nella root), **prima di scrivere in `MEMORY.md` riconcilialo
con quello che è successo davvero in questa sessione**, senza chiedere conferma:

- spunta le checkbox dei task completati;
- porta a `**Status:** complete` le fasi chiuse, e a `in_progress` quella in corso;
- allinea il campo `## Next Step` alla prima cosa ancora da fare — è uno dei campi che
  l'hook inietta a ogni messaggio, quindi un disallineamento lì si propaga a ogni ripresa;
- aggiungi **in fondo** a `progress.md` (è append-only) le voci mancanti: cosa è stato
  fatto, cosa ha dato errore, cosa è stato provato e non funziona.

> **Questa è una rete di sicurezza, non il momento in cui il piano viene scritto.**
> Il piano si aggiorna **durante il lavoro**: l'hook `PostToolUse` lo richiama dopo ogni
> Write/Edit, e la regola «aggiorna dopo ogni fase» sta nella skill `planning-with-files`.
> Qui raccogli **solo ciò che è sfuggito**.
>
> Non è una formalità: se il piano si allineasse solo a fine sessione, un `/clear` a metà
> lavoro troverebbe su disco uno stato vecchio e la ripresa ripartirebbe da una fase già
> fatta — cioè proprio la resilienza per cui il sistema esiste. Se ti accorgi di stare
> spuntando molte caselle tutte insieme, **dillo all'utente**: vuol dire che durante la
> sessione l'aggiornamento continuo non è avvenuto.

Poi **leggi** `task_plan.md`, `progress.md` e `findings.md`: sono il resoconto di cosa è
successo, e ti risparmiano di ricostruirlo a memoria per il punto 2.

---

## 2. Riscrivi il contenuto — **solo se c'è qualcosa di duraturo**

Prima decidi, e la decisione è tua, non dell'utente: **dalla sessione è emerso qualcosa
che sopravvive a questo task?** Cioè una decisione presa e il perché, un vincolo scoperto
sul campo, una strada provata che non funziona, un file che diventa centrale.

- **No** → **non toccare `MEMORY.md`.** Dillo in una riga («niente di duraturo da
  registrare, `MEMORY.md` invariato») e salta al punto 3. Non è un fallimento
  dell'handoff: è il caso normale di una sessione in cui si è solo avanzato nel piano.
- **Sì** → aggiorna, come sotto.

Il motivo è concreto: `MEMORY.md` deve restare leggibile in cinque minuti. Scriverci a
ogni handoff lo riempie di cronaca («oggi corretto il path») — che è esattamente ciò che
`progress.md` esiste per contenere, e che verrà archiviato col piano. Due memorie che si
sovrappongono tornano a essere una memoria confusa.

Aggiorna **le sezioni**, mai la struttura del file:

```markdown
## 🎯 Stato attuale      → 2-3 frasi su dove siamo arrivati
## 📁 File chiave        → file toccati in questa sessione e perché
## 🧩 Fatti permanenti   → decisioni, porte, URL, scelte architetturali durature
## 🐛 Bug noti           → sintomo → causa → fix
## 📋 Prossimi passi     → esattamente 3 task, precisi e azionabili
```

Aggiorna la riga `> Ultimo aggiornamento:` con la data di oggi.

**Regole di contenuto:**
- Scrivi ciò che un nuovo agente **non può dedurre leggendo il codice**: decisioni, motivi,
  vincoli, cose provate che non funzionano. Non riassumere il codice.
- **Mai credenziali**: cita dove stanno (`password in mcp_server/.env`), mai il valore.
- **Mai meta-contenuto** sul salvataggio stesso ("memoria verificata", "score 100/100").
- Se un fatto vale per tutta la macchina e non per questo progetto, mettilo in
  `~/.memory/shared/ambiente.md`.
- Preferisci sostituire informazioni superate invece di accumularle: il file deve restare
  leggibile in meno di 5 minuti (indicativamente < 150 righe).

---

## 3. Archivia il piano, se è finito

Non chiederlo all'utente: verificalo. Le fasi complete le riporta già

```bash
sh ~/.memory/skills/planning-with-files/scripts/check-complete.sh
```

- **Non tutte complete** → il piano resta attivo, non toccarlo. È il caso normale.
- **Tutte complete** → archivialo **spostandolo di un livello**:

  ```bash
  mkdir -p .planning/archive && mv .planning/<slug> .planning/archive/ && : > .planning/.active_plan
  ```

  Il posto conta. Rinominarlo *dentro* `.planning/` (es. `.planning/done-<slug>/`) non lo
  disattiva: con `.active_plan` vuoto il resolver ripiega sulla cartella più recente di
  `.planning/` che contenga un `task_plan.md`, e ripescherebbe proprio il piano appena
  archiviato, re-iniettandolo a ogni messaggio della sessione dopo. Sotto
  `.planning/archive/` il `task_plan.md` non è più al primo livello e la scansione lo salta.

  Poi **verificalo invece di dichiararlo** — deve stampare una riga vuota:

  ```bash
  sh ~/.memory/skills/planning-with-files/scripts/resolve-plan-dir.sh
  ```

  Se stampa ancora un percorso, l'archiviazione non ha funzionato: **dillo** e correggi,
  non chiudere l'handoff.

---

## 3-bis. Verifica la memoria

**Se al punto 2 hai scritto**, rileggi il file e controlla che:
- le 5 sezioni ci siano tutte e nessuna sia rimasta col testo segnaposto;
- i 3 prossimi passi siano azionabili da soli, senza il contesto di questa chat.

Se non hai scritto, salta questi due controlli — ma **non** il comando qui sotto.

Collega la memoria all'indice globale ogni volta che un `MEMORY.md` esiste, anche se in
questa sessione non l'hai toccato: è così che i progetti restano visibili a `mem search`,
e un progetto collegato mesi fa da un'altra macchina o da un altro client potrebbe non
esserlo qui.

```bash
~/.memory/bin/mem link "$PWD"
```

È idempotente (rieseguirlo su un progetto già collegato non fa nulla) e rigenera l'indice da sé.
Saltare questo passo lascia il progetto invisibile a `mem list` e `mem search`.

Se la scrittura fallisce (permessi, percorso errato) **dillo esplicitamente** e non
dichiarare l'handoff completato.

---

## 3-ter. Checkpoint Git (solo se è un repository Git)

Questo passaggio scatta **solo ed esclusivamente se la directory `.git/` esiste** nella radice del progetto. Se il progetto non è un repository Git, salta direttamente al punto 4 senza fare nulla e senza produrre errori.

Se `.git/` esiste:
1. **Verifica modifiche**:
   ```bash
   git status --porcelain
   ```
   Se l'output è vuoto (working tree già pulito), salta al punto 4.

2. **Pre-commit test gate**: se il progetto include una test suite (es. `python3 run_tests.py`, `npm test`, `pytest`), eseguila preventivamente. Se i test falliscono, **non committare**, avvisa l'utente e segnalalo nell'handoff.

3. **Staging sicuro**:
   ```bash
   git add .
   ```
   *(Garantito dal `.gitignore`: mai forzare file esclusi con `-f`)*.

4. **Commit convenzionale**:
   ```bash
   git commit -m "docs(handoff): session sync & memory update"
   ```
   *(Se l'utente ha fornito un focus all'invocazione di /handoff, includilo nel messaggio di commit)*.

5. **Push remoto automatico**:
   Se il repository ha un remote configurato (`git remote` contiene `origin` o simili), esegui il push del branch corrente:
   ```bash
   git push
   ```

---

## 4. Chiudi

Riporta all'utente **sempre queste righe**, in questo ordine, così sa cosa è successo senza doverlo chiedere:

1. **Piano** — cosa hai allineato (fasi completate, `Next Step` aggiornato), oppure «era già allineato». E se lo hai archiviato, dove.
2. **Memoria** — il percorso del file aggiornato e cosa ci hai messo, **oppure** «niente di duraturo, `MEMORY.md` invariato». Mai lasciarlo implicito.
3. **Git** — se il progetto è un repo Git: commit hash e stato del push (es. `commit d9164cb pushato su origin/main`), oppure «working tree già pulito» o «non applicabile (progetto non Git)».
4. **Prossimi passi** — i 3 di `MEMORY.md` se il piano è chiuso; se il piano è ancora attivo, il `Next Step` del piano, che è più preciso.

Se la sessione successiva riparte da zero non serve che l'utente digiti nulla: in Claude
Code gli hook di avvio iniettano già memoria e piano. `/resume` resta utile solo se vuole
rivedere il quadro, ed è invece **necessario** da OpenCode e Antigravity, dove gli hook
non esistono.

---

## Note

- Un progetto = un file. Non creare copie, riassunti o report in `/tmp`: se un contenuto
  merita di sopravvivere alla sessione, sta nel `MEMORY.md`.
- Per cercare in tutte le memorie: `~/.memory/bin/mem search <termine>`.
- Lo storico del vecchio knowledge graph Graphiti è in `~/.memory/archive/graphiti-export/`
  (sola lettura, non aggiornarlo).
