---
name: uiverse
description: "Direct integration with the Uiverse.io galaxy of open-source CSS & Tailwind UI elements (buttons, loaders, toggle switches, cards, animated inputs, checkboxes, tooltips). Allows agents to discover, extract, and adapt community UI elements into clean React/Tailwind/CSS components."
user-invocable: true
allowed-tools: "Read Write Edit Bash Glob Grep"
category: design
risk: low
metadata:
  author: Mattia & Deepmind Pair Programmer
  version: "1.0.0"
---

# Uiverse.io Galaxy Skill

Access and integrate the massive open-source library of **[Uiverse.io](https://uiverse.io)** UI components directly into any web or mobile project.

Uiverse contains tens of thousands of community-crafted CSS & Tailwind micro-elements:
- **`Buttons`**: Magnetic hover states, glowing borders, neon, 3D tactile buttons, gradient shifts.
- **`loaders`**: Futuristic spinners, pulsing dots, circular progress bars, SVG liquid loaders.
- **`Toggle-switches`**: Dark/light mode animated toggles, mechanical switches, sliding tabs.
- **`Cards`**: Glassmorphism cards, bento hover effects, 3D perspective tilts.
- **`Inputs` & `Forms`**: Floating label inputs, animated border focus, cyber search bars.
- **`Checkboxes` & `Radio-buttons`**: SVG pop animations, tactile checkmarks.
- **`Tooltips` & `Notifications`**: Toast badges, hover cards, subtle hint bubbles.
- **`Patterns`**: Background grid meshes, dot matrices, geometric CSS textures.

---

## 1. Quick Discovery & CLI Tool

This skill includes an automated CLI helper located at `scripts/uiverse.py` (or accessible directly via python) that indexes the official `uiverse-io/galaxy` GitHub repository.

### Commands:

1. **List Categories**:
   ```bash
   python3 ~/.memory/skills/uiverse/scripts/uiverse.py categories
   ```

2. **Search by Keyword**:
   ```bash
   python3 ~/.memory/skills/uiverse/scripts/uiverse.py search <keyword> [limit]
   # Example:
   python3 ~/.memory/skills/uiverse/scripts/uiverse.py search "neon button" 10
   python3 ~/.memory/skills/uiverse/scripts/uiverse.py search "toggle" 10
   python3 ~/.memory/skills/uiverse/scripts/uiverse.py search "spinner" 5
   ```

3. **Fetch HTML & CSS of a Component**:
   ```bash
   python3 ~/.memory/skills/uiverse/scripts/uiverse.py fetch <path>
   # Example:
   python3 ~/.memory/skills/uiverse/scripts/uiverse.py fetch "Toggle-switches/AIVIIID_spicy-horse-27.html"
   python3 ~/.memory/skills/uiverse/scripts/uiverse.py fetch "Buttons/0x-Sarthak_hungry-penguin-30.html"
   ```

---

## 2. Adaptation Guidelines (Anti-Slop & Zero Style Pollution)

When extracting a Uiverse component, NEVER dump raw un-scoped `<style>` tags into a global stylesheet. Follow these strict conversion rules:

### A. In React / Next.js Projects:
1. **Option 1: Scoped CSS Modules (Recommended for complex CSS animations/pseudo-elements)**:
   - Create `[Component].module.css` and `[Component].tsx`.
   - Paste the extracted CSS into the module and bind classes with `styles.className`.
2. **Option 2: Inline Tailwind Conversion**:
   - If the element uses standard CSS (padding, border-radius, background, transitions), map them cleanly to Tailwind classes.
   - For custom `@keyframes` or complex pseudo-elements (`::before`, `::after`), keep them in a scoped CSS module or Tailwind arbitrary values.

### B. Harmonic Color Token Mapping:
- **Replace hardcoded hex colors**: Uiverse snippets often have arbitrary colors (e.g. `#552da8`, `#00ffcc`).
- **Map to project tokens**: Replace hardcoded values with semantic variables (`bg-primary`, `text-foreground`, `border-border`, `accent-cyan`, etc.) to match the active project palette defined by `taste-skill`.

---

## 3. Position in the Frontend Stack

| Tool | Role & Scope |
| :--- | :--- |
| **`shadcn`** | Layout skeletons, dialogs, dropdowns, forms, accessible primitives. |
| **`21st` (MCP)** | Hero sections, bento grids, large interactive blocks. |
| **`uiverse`** | **Micro-Interactions & Special Flair**: Bespoke toggle switches, high-craft buttons, futuristic loaders, custom inputs. |
| **`gsap-animation`** | Page-level timelines, ScrollTrigger, kinetic orchestrations. |
