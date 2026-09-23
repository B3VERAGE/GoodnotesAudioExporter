---
name: master-project-planner
description: "Architect-level master planning for greenfield projects and major initiatives. Listens to informal, conversational user ideas, conducts an in-depth 5-dimension discovery interview, and generates a production-grade MASTER_PLAN.md with architecture diagrams, domain models, 4-phase incremental milestones, and strict Definitions of Done."
user-invocable: true
allowed-tools: "Read Write Edit Bash Glob Grep"
category: architecture
risk: low
metadata:
  author: Mattia & Deepmind Pair Programmer
  version: "1.0.0"
---

# Master Project Planner

Turn conversational, unorganized user ideas into a comprehensive, production-grade `MASTER_PLAN.md`.

## When to Use

Activate this skill whenever the user:
- Describes a new application, service, or major system from scratch ("Voglio creare una nuova app...", "Ho questa idea per un progetto...", "Pianifica questo nuovo software...");
- Requests a complete master plan, end-to-end roadmap, or architecture blueprint;
- Wants to explore requirements through an architectural interview before writing any code.

Do NOT use for:
- Monolith-to-microservices code decomposition of existing large codebases (use `decomposition-planning-roadmap`).
- Day-to-day individual feature task tracking (use `planning-with-files`).
- Writing raw UI code without discovery (use `frontend-blueprint`).

---

## The Master Planning Workflow

```
Conversational User Prompt
           ↓
[Step 1] Macro-Analysis & Module Extraction
           ↓
[Step 2] In-Depth 5-Dimension Discovery Interview
           ↓
[Step 3] Architecture & Technology Consensus
           ↓
[Step 4] Generate MASTER_PLAN.md (from template)
           ↓
[Step 5] Handoff to AGENTS.md & planning-with-files
```

---

## Step-by-Step Protocol

### Step 1: Macro-Analysis & Immediate Synthesis
When the user shares their vision in conversational language:
1. **Never jump directly to writing code or generic skeletons.**
2. Extract and summarize:
   - The Core Problem and Target User (Job-To-Be-Done).
   - High-level functional modules (e.g. Auth, Data Feed, Processing, Third-Party APIs).
   - Implicit vs Explicit constraints (e.g. "must work on iPhone", "fast response time", "zero-cost hosting").

---

### Step 2: The 5-Dimension Deep Discovery Interview

Interrogate the user methodically across the 5 essential software engineering dimensions.

> [!NOTE]
> Present the questions clearly and engagingly. If the user is unsure or lacks a technical preference, **propose 2–3 concrete industry-standard recommendations with trade-offs** (e.g. *"Per il database ti consiglio Supabase se vuoi Postgres con auth pronta, oppure Cloudflare D1 se vuoi massima leggerezza serverless"*).

#### Dimension 1: Vision, Target & Core Value
- Who is the primary persona using this application daily?
- What are the top 2–3 actions that deliver 90% of the value?
- What features or ideas are strictly **OUT OF SCOPE** for the MVP launch (anti-scope-creep guardrail)?

#### Dimension 2: Architecture & Technology Stack
- Target platform: Mobile (SwiftUI / React Native), Web SPA/SSR (Next.js / Vite), Desktop (Tauri / Electron), or Backend CLI/API?
- Package manager & runtime preferences (Bun, PNPM, Swift PM, Python UV/Poetry)?
- Architectural style: Modular Monolith, Clean Architecture, Serverless, or Event-Driven?

#### Dimension 3: Domain Modeling, Persistence & State
- What are the 3 to 5 core business entities (e.g. `User`, `Project`, `Subscription`, `Invoice`) and how do they relate?
- Persistence engine: Relational SQL (PostgreSQL, SQLite), Document store, or Local-first sync?
- Global client state management: Zustand, React Query, `@Observable`, Redux Toolkit?

#### Dimension 4: UX/UI Specification & Critical User Journeys
- What are the primary screens/views (Onboarding, Dashboard, Detail view, Modal flows)?
- Edge cases: How does the application behave offline, under poor connectivity, or when lists are empty (*empty states*)?
- Design Language: Tailwind CSS, Shadcn UI, iOS Human Interface Guidelines, Dark Mode requirements?

#### Dimension 5: Integrations, Security & Deployment
- Authentication & RBAC: Social OAuth (Google, Apple), Magic Link, Email/Password, User vs Admin roles?
- External Services: Cloud Storage (S3 / Cloudflare R2), Payments (Stripe), Transactional Emails (Resend), AI Inference?
- Production destination: Vercel, Cloudflare Pages/Workers, VPS (Docker), App Store TestFlight?

---

### Step 3: Synthesis & Verification
Review the user's answers and confirm the architectural choices:
- Highlight potential bottlenecks, security boundaries, or scaling constraints.
- Formulate Architecture Decision Records (ADRs) for any non-obvious choices.

---

### Step 4: Generate `MASTER_PLAN.md`
Read the reference template at `references/master-plan-template.md` and write `MASTER_PLAN.md` to the project root.

The generated plan MUST include:
1. **System Architecture Diagram** (`mermaid` format).
2. **Entity Relationship Diagram** (`mermaid` format).
3. **4-Phase Milestone Breakdown with Anti-Bias Audit Gates**:
   - **Milestone 1**: Scaffolding, Toolchain, Schema & Auth → Ends with **Task 1.Final (Audit Gate)**.
   - **Milestone 2**: Core MVP Flow & Primary User Journey → Ends with **Task 2.Final (Audit Gate)**.
   - **Milestone 3**: Third-Party Integrations, Notifications, Edge Cases & Polish → Ends with **Task 3.Final (Audit Gate)**.
   - **Milestone 4**: Security Hardening, QA & Launch Readiness → Ends with **Task 4.2/4.3 (Release Gate)**.
   - **Audit Execution Rule (Hybrid & Anti-Bias)**:
     - Each `Task X.Final` MUST specify:
       - **Primary Executor**: Dedicated QA/Reviewer Subagent (if listed in `AGENTS.md` under `## Subagents & Roles`), executed in an isolated thread to eliminate cognitive confirmation bias.
       - **Fallback Executor**: Skill `the-judge` + `lint-and-validate` (evidence-first proof with `file:line`, strict noise gate).
     - **Gate Condition**: No milestone can be marked complete `[x]` and no subsequent milestone can begin if any blocker 🔴 or unverified DoD remains open.
4. **Granular Task Specifications**:
   - Every task must have:
     - Clear description.
     - Expected target files.
     - **Definition of Done (DoD)** (exact verification criteria required before marking `[x]`).
5. **ADR Table**: Documented trade-offs for core choices.

---

### Step 5: Handoff to `AGENTS.md` and `planning-with-files`

Once `MASTER_PLAN.md` is approved by the user:
1. Advise the user to run `agent-rules-generator` to create the companion `AGENTS.md` and rule files matching this stack.
2. Initialize `.planning/` via `planning-with-files` to track execution of **Milestone 1, Task 1.1**:
   - **Hierarchical Parent-Child Rule**: `MASTER_PLAN.md` is the **Single Source of Truth (SSOT)** for project roadmap, milestones, architecture, and DoD.
   - **No Duplication**: The created `task_plan.md` in `.planning/` is a **micro-zoom child** targeting *only* Task 1.1. It MUST NOT copy the entire roadmap or all 4 milestones.
   - **Mandatory Two-Way Sync**: Upon completing the micro-steps in `task_plan.md` and verifying the DoD, the executing agent MUST immediately edit `MASTER_PLAN.md` to check the box (`- [x] Task 1.1: ...`) and log the sync in `progress.md`.
3. Future sessions can run `/resume` to inspect both `MASTER_PLAN.md` (macro roadmap status) and `.planning/` (micro task in progress) with zero confusion.
