---
name: gsap-animation
description: "Official GreenSock (GSAP) animation suite for React, Next.js, and Web. Master timelines, ScrollTrigger, useGSAP hook, kinetic motion, and GPU-accelerated performance without memory leaks."
user-invocable: true
allowed-tools: "Read Write Edit Bash Glob Grep"
category: design
risk: low
metadata:
  author: GreenSock & Mattia
  version: "1.0.0"
---

# GSAP Animation Suite

Official patterns from GreenSock for building fluid, cinematically rich, and performant web animations.

## When to Use

Activate this skill whenever:
- Creating complex UI animations, kinetic typography, or staggered element reveals;
- Implementing scroll-linked interactions, parallax, or pinning with **GSAP ScrollTrigger**;
- Building React or Next.js components that require animations via the official `@gsap/react` (`useGSAP`) hook;
- Avoiding React animation anti-patterns (memory leaks, uncleaned timelines, and hydration mismatches).

---

## The Golden Rules for React & Next.js

### 1. Always use `useGSAP()` instead of `useEffect()`
```tsx
import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function AnimatedHero() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // Selectors are automatically scoped to container!
    gsap.from('.hero-title', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      ease: 'power3.out',
    });

    gsap.from('.hero-card', {
      y: 30,
      opacity: 0,
      stagger: 0.15,
      delay: 0.3,
      ease: 'power2.out',
    });
  }, { scope: container });

  return (
    <div ref={container} className="hero-container">
      <h1 className="hero-title">Elevate Your Workflow</h1>
      <div className="hero-card">Feature 1</div>
      <div className="hero-card">Feature 2</div>
    </div>
  );
}
```

### 2. Never animate top/left/margin — Always animate transforms
- ✅ Use `x`, `y`, `scale`, `rotation`, `opacity` (handled on compositor thread / GPU).
- ❌ Do NOT animate `width`, `height`, `top`, `left` (causes layout reflows and jank).

### 3. Respect `prefers-reduced-motion`
Always wrap high-intensity kinetic animations with `gsap.matchMedia()`:
```tsx
useGSAP(() => {
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    // Run full animation
  });
  mm.add('(prefers-reduced-motion: reduce)', () => {
    // Simplified, instant fade or static state
  });
}, { scope: container });
```

---

## Detailed References
- **Core Tweens & Timelines**: Read `references/gsap-core.md` and `references/gsap-timeline.md`.
- **React Hook (`useGSAP`)**: Read `references/gsap-react.md`.
- **ScrollTrigger Deep Dive**: Read `references/gsap-scrolltrigger.md`.
- **Performance & Easing**: Read `references/gsap-performance.md`.
