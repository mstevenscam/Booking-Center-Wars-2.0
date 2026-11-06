# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## PHASED DEVELOPMENT ROADMAP & MILESTONES
**Version:** 1.0.0-ROADMAP  
**Methodology:** Iterative Milestone-Driven Delivery with Strict Quality Gates  

---

### PHASE SUMMARY OVERVIEW
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   PHASE 1    │ ──> │   PHASE 2    │ ──> │   PHASE 3    │
│ Foundation & │     │ Pure Engine  │     │ Battlefield  │
│ Architecture │     │ & Unit Tests │     │ UI & Handoff │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
┌──────────────┐     ┌──────────────┐            │
│   PHASE 6    │ <── │   PHASE 5    │ <──────────┘
│ Polish, Feel │     │ Card Workshop│     ┌──────────────┐
│ & Sound FX   │     │ & Gemini AI  │ <── │   PHASE 4    │
└──────────────┘     └──────────────┘     │ Deck Builder │
                                          │ & Collection │
                                          └──────────────┘
```

---

### PHASE 1A: FOUNDATION, RULES, & ARCHITECTURE (COMPLETED)
- **Goal:** Establish complete game rules, mathematical balance model, decoupled architecture, database schemas, and documentation.
- **Key Deliverables:**
  - [x] Complete 12 core architectural and design documents.
  - [x] Canonical TypeScript contracts for Cards, Abilities, and Engine actions.
  - [x] Shift System and Booking Queue specification.
  - [x] Interactive Foundation Portal & Balance Simulator Hub in `src/App.tsx`.
- **Exit Criteria:** All 12 documents verified and approved; zero compilation errors; core game design signed off.

---

### PHASE 1B: INDEPENDENT AUDIT, BALANCE REVIEW & RULES LOCK (CURRENT MILESTONE)
- **Goal:** Critical review of all Phase 1 assumptions, mathematical validation of Shift and Queue curves, first-player fairness proof, and Theme/Terminology separation architecture.
- **Key Deliverables:**
  - [x] `PHASE_1B_INDEPENDENT_AUDIT.md`: Inventory of actual state, critique of Phase 1 assumptions, 4-slot vs 5-slot vs 6/7-slot analysis.
  - [x] `FINALIZED_GAME_RULES.md`: Canonical rules lock for turns, phases, and resources.
  - [x] `FINALIZED_COMBAT_RULES.md`: Authoritative combat laws and persistent damage lifecycle.
  - [x] `FINALIZED_BOOKING_QUEUE_RULES.md`: Max 3 tickets per player, 1-Shift floor, FIFO+Influence resolution.
  - [x] `FINALIZED_BALANCE_MODEL.md`: Exact mathematical equations for Vanilla Curve, Queue Discount, and keyword taxes.
  - [x] `GAME_ENGINE_REQUIREMENTS.md`: Engine specs with MAX_EXECUTION_STEPS = 25, event queue, cycle detection.
  - [x] `RULE_DECISION_LOG.md`: Complete audit log of approved, adjusted, rejected, and deferred decisions.
  - [x] `THEME_AND_TERMINOLOGY_SYSTEM.md`: Complete separation of stable internal IDs from display terminology.
  - [x] `src/engine/balance.ts` and automated simulation validator tests (`src/engine/tests/simulation_validator.test.ts`).
- **Exit Criteria:** All 7 Phase 1B documents published, mathematical simulation passing, rules ready for formal human review.

---

### PHASE 2: CORE DECOUPLED GAME ENGINE & AUTOMATED UNIT TESTS
- **Goal:** Build the 100% pure TypeScript game engine under `src/engine/` with zero React dependencies, verified by comprehensive unit tests.
- **Key Deliverables:**
  - `src/engine/state.ts`: Immutable GameState definitions and initialization.
  - `src/engine/reducer.ts`: Pure reducer handling all `GameAction` variants.
  - `src/engine/validator.ts`: Comprehensive legality checks for all moves.
  - `src/engine/combat.ts`: Simultaneous damage and Front Desk Guard enforcement.
  - `src/engine/queue.ts`: Booking Queue ticket decrement and resolution logic.
  - `src/engine/tests/*.test.ts`: Automated `node:test` suite covering:
    - Shift resource allocation and limits.
    - Attack declaration and Front Desk Guard blocking.
    - Queue ticket countdowns and trigger execution.
    - Burnout fatigue escalation.
    - Morale depletion win/loss triggers.
- **Exit Criteria:** `npx --yes tsx --test` passes 100% of engine tests.

---

### PHASE 3: BATTLEFIELD UI & LOCAL PASS-AND-PLAY IMPLEMENTATION
- **Goal:** Implement the responsive, Hearthstone-inspired battlefield with local pass-and-play support.
- **Key Deliverables:**
  - 5-slot Character grid per player with dynamic card frames.
  - Interactive hand fan with tilt physics and hover zoom.
  - Drag-and-drop targeting with curved SVG bezier laser.
  - Central Booking Queue rack showing countdown tickets.
  - Resource displays (Shift Battery, Morale Counters).
  - The **Privacy Handoff Curtain** preventing hand-peeking between player turns.
  - Play-by-play combat log.
- **Exit Criteria:** Two players can complete a full 30-card match on a single device with zero bugs.

---

### PHASE 4: DECK BUILDER & COLLECTION MANAGEMENT
- **Goal:** Enable players to browse cards, filter by affiliations, and construct valid 30-card decks.
- **Key Deliverables:**
  - Collection browser with filter pills (Affiliations, Cost, Card Type, Rarity).
  - Deck editor enforcing 30 cards total and max 2 copies per card.
  - Mana/Shift curve visualization graph.
  - Pre-built starter decks (e.g. *"Cage Technicians Aggro"*, *"Administrative Gridlock Control"*).
  - LocalStorage and Firestore deck synchronization.
- **Exit Criteria:** Players can build, save, edit, and launch matches with custom decks.

---

### PHASE 5: CARD WORKSHOP & GEMINI MULTIMODAL AI PIPELINE
- **Goal:** Ingest original physical card scans (front and back) and translate them into verified playable cards.
- **Key Deliverables:**
  - Drag-and-drop file upload for front and back card images (JPG, PNG, WebP, ZIP batch).
  - Server-side Gemini 2.5/Flash multimodal endpoint (`/api/workshop/analyze-card`).
  - OCR transcription of legacy jokes, titles, and lore.
  - AI rule synthesis generating balanced `AbilityDefinition` and stat suggestions.
  - Dual-column Admin Review Interface: Original Card Archive (Left) vs. Playable Game Card Editor (Right).
  - Admin approval button committing the card to `/cards` in Firestore.
- **Exit Criteria:** Physical card photos can be uploaded, analyzed via Gemini, refined, and approved into the active playable card pool.

---

### PHASE 6: GAME FEEL, PROCEDURAL SOUND FX, & BALANCE POLISH
- **Goal:** Elevate presentation to commercial quality with tactile game feel and audio.
- **Key Deliverables:**
  - Web Audio procedural synth effects (card play whoosh, combat crunch, ticket print chime, victory fanfare).
  - Combat impacts: 50ms simulation hitstop, camera shake, floating combat text.
  - Automated Monte Carlo balance bot simulator (running 500 mirror matches to track archetype win rates).
  - Full responsive optimization.
- **Exit Criteria:** Complete game feel loop verified in browser via visual and interactive inspection.
