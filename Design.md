# Flow Desktop - UI/UX Design System & Architectural Guidelines

This document serves as the absolute source of truth for all frontend UI/UX design and React architecture in Flow Desktop. You, the AI Agent, must strictly adhere to these rules before writing any React or Tailwind CSS code. 

**Our Aesthetic:** Premium FOSS, Enterprise-Grade Data Dashboard, Utilitarian, Flat Material Design 3 (MD3).

## 1. THE "ANTI-SLOP" MANIFESTO (ZERO TOLERANCE)
AI models naturally default to outdated "Dribbble-style" UI trends. The following are **STRICTLY FORBIDDEN** in this codebase:
*   ❌ **NO Gradients:** Do not use `bg-gradient-to-*` unless explicitly instructed for a specific image overlay.
*   ❌ **NO Glassmorphism:** Do not use `backdrop-blur` or semi-transparent milky backgrounds.
*   ❌ **NO Drop Shadows:** Do not use `shadow-md`, `shadow-lg`, or glowing neon box-shadows. 
*   ❌ **NO Colored Borders:** Do not use primary-colored borders around cards. All borders must be muted neutral.
*   ❌ **NO Arbitrary Hex Codes:** Do not invent colors. You must use the CSS variables defined in `App.css`.

## 2. COLOR & DEPTH SYSTEM
We establish depth mathematically through contrast and subtle borders, NOT shadows. 
All colors must map to the CSS variables in `App.css` (e.g., `var(--color-surface)`).

*   **App Background:** The absolute base of the app.
*   **Surfaces (Cards/Panels):** Use `bg-surface-container-low` or `bg-surface-container`.
*   **Borders:** Use 1px borders to separate surfaces: `border border-neutral-800` or `border-neutral-800/50`.
*   **Dividers:** Use `divide-y divide-neutral-800` for lists instead of wrapping every item in a heavy card.
*   **Primary Color Usage:** Use the primary accent color (`var(--color-primary)`) *sparingly*. Use it only for active states, primary call-to-action (CTA) buttons, and vital data visualization lines.

## 3. LAYOUT & ARCHITECTURE
*   **The Bento Box Grid:** For dashboards and settings, eliminate empty space using strict CSS grids. Wrap content in a ` mx-auto` container, use `grid-cols-12`, and assign `col-span-*` to cards so they snap together perfectly with `gap-4` or `gap-6`.
*   **Horizontal Shelves:** For content feeds, use `flex overflow-x-auto snap-x hide-scrollbar` for smooth native swiping.
*   **Density:** Prefer high data density. Use Data Tables or dense lists with flex rows over massive, empty block cards.

## 4. TYPOGRAPHY HIERARCHY
Text contrast is our primary tool for visual hierarchy. 
*   **Page Titles:** `text-3xl` or `text-4xl font-bold tracking-tight text-neutral-100`.
*   **Card/Section Titles:** `text-base font-medium text-neutral-200`.
*   **Subtitles & Labels:** `text-sm text-neutral-400`.
*   **Overhead Category Labels:** `text-xs uppercase tracking-widest text-neutral-500 font-semibold`.
*   **Statistics / Data:** Must always use mono-spaced fonts for alignment: `font-mono text-neutral-100`.

## 5. COMPONENT BLUEPRINTS
*   **Radii:** 
    *   Chips, Badges, and Pill Buttons: `rounded-full`.
    *   Standard Cards & Dialogs: `rounded-2xl`.
    *   Video Thumbnails & Images: `rounded-xl`.
    *   Small Inputs & Menus: `rounded-lg` or `rounded-md`.
*   **Buttons:**
    *   *Primary:* `bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full px-4 py-2 font-medium`.
    *   *Secondary/Tonal:* `bg-surface-container-high hover:bg-surface-container-highest text-neutral-200 rounded-full transition-colors`.
    *   *Destructive:* Muted red styling. `bg-red-950/30 text-red-400 border border-red-900/50`.
*   **Icons:** Use standard, monochrome SVG icons. Size them appropriately (`w-5 h-5`) and color them `text-neutral-400` unless active.

## 6. INTERACTION & ANIMATION
*   **Hover States:** Every interactive element must have a hover state. Use `transition-colors duration-200 ease-out`. (e.g., `hover:bg-neutral-800`).
*   **Frictionless:** Avoid accordions or hidden menus for core settings. Expose settings as clean lists with toggles directly visible.
*   **Snappiness:** The app must feel instant. Use CSS transitions for micro-interactions, but do not use long, delayed, or bouncy entry animations. 

## 7. FRONTEND SYSTEMS ARCHITECTURE & MODULARITY
Code must be strictly modular, maintainable, and follow the Single Responsibility Principle (SRP) mapped to our specific directory structure.

*   **Context-Aware Layouts:** 
    *   *Dashboards & Settings (`persona`, `extensions`, `onboarding`):* Use the Bento Box Grid (`grid-cols-12`).
    *   *Content Feeds (Home, Channel Videos):* Use responsive CSS Grids (`grid-cols-2 md:grid-cols-4 lg:grid-cols-5`). Do NOT use Bento boxes for video feeds.
    *   *Video Player:* Use Edge-to-Edge CSS Grid with max-width content limiters.
*   **Separation of Concerns (Container / Presentational Pattern):**
    *   **Dumb Primitives (`src/components/ui/`):** These only accept props and emit events. They NEVER fetch data.
    *   **Smart Domains (`src/components/[domain]/`):** (e.g., `channel`, `player`, `persona`). These act as containers. They use custom hooks to fetch data from the Rust backend and pass it down to dumb components.
    *   **Top-Level Views (`src/pages/`):** Compose domain components into full routes.
*   **Custom Hooks Only (`src/lib/`):** Never put `invoke('tauri_command')` or `fetch()` calls directly inside a `useEffect` within a UI component. Abstract all backend communication into custom hooks (e.g., `useFetchChannel(id)`, `useFlowNeuro()`).
*   **State Management (`src/store/`):** Use Zustand for global state (Theme, Player State, Settings). Use local component state ONLY for temporary UI toggles (e.g., dropdown open/closed).
*   **Localization (`src/locales/`):** Do not hardcode UI text strings. Always use `react-i18next`.

## 8. PERFORMANCE & LOAD BALANCING
*   **Optimistic UI Loading:** For local database actions (toggling SponsorBlock, liking a video locally, updating FlowNeuro), update the React UI state *instantly* before waiting for the Tauri SQLite backend to respond. This masks IPC latency.
*   **API Debouncing (Client-Side Traffic Control):** Never spam the Rust Innertube client on every keystroke. Search inputs or rapid configuration toggles must be wrapped in a `useDebounce` hook (from `src/lib/`) to prevent YouTube BotGuard from triggering `429 Too Many Requests`.
*   **Graceful Degradation:** If a FOSS API (DeArrow, Return YouTube Dislike, SponsorBlock) fails to fetch, the UI must gracefully fall back to default metadata without breaking the page layout.

## AGENT EXECUTION DIRECTIVE:
When tasked with creating or modifying a UI component in this repository, you must read and acknowledge this `design.md` file first. If your proposed code contains `shadow-`, `bg-gradient-`, places business logic inside `components/ui/`, or uses arbitrary hex colors instead of `App.css` variables, REWRITE IT before presenting it to the user.