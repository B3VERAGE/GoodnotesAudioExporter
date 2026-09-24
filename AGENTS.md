# AGENTS.md — Goodnotes 6 AI Audio Exporter

<!-- AGENTS-GENERATED-START -->

## Project Overview

Goodnotes 6 AI Audio Exporter is a native macOS desktop application and background API service built to extract, decipher, rename, and export audio recordings directly from Goodnotes notebooks stored on iCloud Drive. It features a "Zero-Space" in-memory ZIP processing pipeline, Caesar/Unicode-Math title decoders, an Apple Light Mode UI in WKWebView, and standalone Arm64 PyInstaller packaging.

- **Language / Runtime**: Python 3.12+ (isolated `.venv`), macOS Sequoia / Sonoma (Apple Silicon)
- **Backend**: Starlette, Uvicorn, Blackboxprotobuf, ZipFile
- **Desktop Shell**: PyWebView (WebKit / WKWebView), PyInstaller (`dist/Goodnotes Agent.app`)
- **Frontend**: Vanilla HTML5, modern CSS3 (Apple Light Mode), Vanilla JS

---

## Subagents & Roles

The following specialized subagents are configured for this project in `goodnotes-team-plugin`:

| Subagent | Role & Purpose | Model | Tools | When to Delegate |
| :--- | :--- | :--- | :--- | :--- |
| `goodnotes-backend-architect` | Modular backend refactoring, Starlette endpoints, in-memory ZIP streaming, Protobuf decoders, async I/O & threadpool execution | `inherit` | Read, Write, Edit, Bash | Backend refactoring, API routes, MP4 binary parsing, performance optimization |
| `goodnotes-ui-specialist` | Apple Light Mode design system, WKWebView layout, floating audio player, micro-interactions, responsive card grids | `inherit` | Read, Write, Edit | Frontend modifications (`index.html`), CSS styling, player UX, client logic |
| `goodnotes-qa-guard` | Quality gate, robustness test suite, PyInstaller compilation verification, anti-regression & ghost track audit | `inherit` | Read, Write, Edit, Bash | Pre-merge verification, automated tests, standalone `.app` packaging, release audits |

> **STRICT DELEGATION**: Writing domain code directly in the main orchestrator thread is strictly prohibited when a dedicated subagent exists above. The orchestrator must ensure the agent is defined and delegate execution via `invoke_subagent`.

---

## Recommended Skills & Workflow

The following skills are active and recommended for this project:

| Skill | Trigger / When to Use | Purpose |
| :--- | :--- | :--- |
| `async-python-patterns` & `python-pro` | Writing or refactoring Python backend code | Non-blocking async execution, clean type hints, modern Python 3.12+ |
| `fastapi-pro` | Designing or updating API contracts | Clean REST endpoints, error boundaries, request schemas |
| `ui-ux-pro-max` & `design-taste-frontend` | Editing `index.html` or CSS styles | Enforce native Apple Light Mode aesthetic, zero AI slop |
| `systematic-debugging` & `lint-and-validate` | Any bug or code change | Root-cause analysis and validation before concluding work |
| `the-judge` | Pre-commit / Pre-release review | Evidence-first review for correctness, stability, and clean code |
| `planning-with-files` & `handoff` | Session start, transitions, and closing | Persistent planning and synchronization in `MEMORY.md` |

---

## Verification & Execution Commands

- **Run Desktop App (Local Dev)**:
  ```bash
  ./.venv/bin/python run_desktop_app.py
  ```
- **Run Standalone Launcher**:
  ```bash
  ./Avvia_Control_Panel.command
  ```
- **Run Decoding Robustness Test**:
  ```bash
  ./.venv/bin/python scratch/verify_decoding_robustness.py
  ```
- **Recompile Standalone macOS App (`.app` bundle)**:
  ```bash
  ./.venv/bin/pyinstaller --clean -y "Goodnotes Agent.spec"
  ```

---

## Core Invariants & Rules

1. **Zero-Space iCloud-Direct**: Never extract full `.goodnotes` archives to local disk; operate directly in-memory via `zipfile.ZipFile`.
2. **Ghost Track Elimination**: Never show or export audio tracks whose physical files are missing from `attachments/` inside the ZIP.
3. **Dynamic Port Negotiation**: Never hardcode port 8000; always use dynamic port fallback in Python and `window.location.origin` in JavaScript.
4. **Absolute Path Loading**: Always load `.env` via `os.path.join(WORKSPACE_ROOT, ".env")` to survive PyInstaller bundle execution from Finder.

---

## Companion Rules

- [Architecture & Flow Rules](.agents/rules/architecture.md)
- [Backend Patterns & Concurrency](.agents/rules/backend-patterns.md)
- [Decoding Standards & Quality Gate](.agents/rules/decoding-testing.md)

<!-- BEGIN FRONTEND_STACK -->
## Frontend Stack & Anti-Slop Guidelines
- **Architecture**: Vanilla ES Modules + Modern Semantic CSS + Dedicated Web Worker (`worker.js`)
- **Design System & Strategy**:
  - `taste-skill`: Pre-flight anti-slop calibration (Apple HIG aesthetic, no generic AI tropes).
  - `ui-ux-pro-max`: Apple HIG tokens, light/dark mode, typography and spacing scale.
  - `impeccable`: Design critique, tactile micro-copy, balanced padding and hierarchy.
- **Component & Storage Stack**:
  - `IndexedDB` (`GN_DB`): Persistent local library of notebooks and track blobs.
  - `Web Worker`: Dedicated thread for non-blocking ZIP unpacking, Protobuf parsing, and MP4 parsing.
  - `MediaSession API`: Native lockscreen audio controls and hardware keys integration.
  - `Service Worker`: Stale-While-Revalidate app shell and offline cache.
- **Verification & Audit Gates**:
  - `the-judge`: Evidence-first review.
  - `mock-hunter`: Zero unverified fake data.
  - `a11y-debugging`: WCAG AA compliance (4.5:1 contrast, keyboard navigation, aria-live).
- **Design Dials Snapshot**:
  - `DESIGN_VARIANCE`: 8/10
  - `MOTION_INTENSITY`: 6/10
  - `VISUAL_DENSITY`: 5/10
<!-- END FRONTEND_STACK -->

<!-- AGENTS-GENERATED-END -->
