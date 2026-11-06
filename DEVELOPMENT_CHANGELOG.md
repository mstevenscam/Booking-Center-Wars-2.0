# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## DEVELOPMENT CHANGELOG
All notable changes, architectural decisions, and version milestones are documented in this file.

---

### [2.2.2-ALPHA-2C-A-FINAL-REMEDIATION] — 2026-11-04
#### Milestone 2C-A Final Remediation: Card Ability Engine Final Technical Audit Corrections

#### Corrected & Remediated
- **RETURN_TO_HAND Template Restoration (`src/engine/abilities.ts`, `src/engine/state.ts`):**
  - Stored immutable `baseTemplate` on `CardInstance` (`baseCost`, `efficiency`, `stamina`, `influence`, `abilities`, keywords).
  - When returned to hand, character is removed from battlefield, statistics restored to pristine base card template values, temporary buffers cleared (`temporaryStaminaBuffer = 0`, `temporaryEfficiencyBuffer = 0`), and permanent buffs reverted.
  - Enforces hand capacity ceiling (8 cards); excess cards retired to Breakroom per approved Breakroom behavior without firing `ON_CLOCK_OUT`.
- **SILENCE_CHARACTER Approved Reset Behavior (`src/engine/abilities.ts`):**
  - Strips abilities and applicable keywords (`isFrontDeskGuard`, `isRush`, `isFirstResponder`, `isInfiltration`, `hasOnDeployAbility`).
  - Clears temporary buffers and resets statistics to base card template (`baseTemplate.efficiency`, `baseTemplate.stamina`).
  - Clamps damaged stamina to base max without healing past damage.
  - Preserves card identity and ownership; prevents silenced units from triggering abilities; creates no departure event.
- **ExecutionContext Preservation Across Queued Trigger Resumption (`src/engine/actions.ts`, `src/engine/state.ts`):**
  - Preserved `executionContext: { depth: number; budgetCount: number }` in `PendingAbilityTargetDecision` and `QueuedTriggerState`.
  - In `RESOLVE_ABILITY_TARGET`, resumes execution using the original execution context, preventing budget bypass across pause/resume cycles.
  - Fully JSON serializable and isolated per `GameState`.
- **Standard Mulberry32 PRNG State Progression (`src/engine/abilities.ts`):**
  - Implemented standard Mulberry32 state progression: `state.rngState = (state.rngState + 0x6D2B79F5) >>> 0`.
  - Output calculation uses local intermediate variable `t` without overwriting the sequence seed.
  - Verified with exact mathematical test vectors for fixed seeds 123456789 and 0, and save/restore continuation tests.
- **Strengthened Target Validation & BOTH_SUPERVISORS (`src/engine/abilities.ts`, `src/engine/actions.ts`):**
  - Enforced comprehensive validation in `isTargetLegal` across all 15 filters (types, battlefield existence, ownership, non-stale queue tickets, supervisor identity, attacker identity).
  - Explicitly modeled `BOTH_SUPERVISORS` target type and dual-Morale damage application.
  - Revalidates targets in `validateAction` and `executeAction` during `RESOLVE_ABILITY_TARGET`.
- **Option A Stamina Model Documentation Alignment:**
  - Corrected documentation to consistently describe the approved model: temporary Stamina augments current and maximum Stamina; damage directly reduces current Stamina; at expiration (Phase 5), temporary maximum increase is removed and current Stamina is clamped to remaining maximum.

---

### [2.2.1-ALPHA-2C-A-REMEDIATION] — 2026-11-04
#### Milestone 2C-A Remediation: Card Ability Engine Corrective Implementation

#### Corrected & Remediated
- **ON_CLOCK_OUT Departure Lifecycle (`src/engine/abilities.ts`, `src/engine/turn_manager.ts`):**
  - Departing character's identity and ability definitions are captured prior to battlefield removal.
  - Departure events are dispatched using the captured snapshot even after moving to Breakroom.
  - Duplicate dispatch prevented via `card.hasTriggeredClockOut = true`.
  - Filtered candidate selection to prevent surviving teammates from firing deathrattles when another unit dies.
  - `DESTROY_CHARACTER` correctly fires `ON_CLOCK_OUT`.
  - `RETURN_TO_HAND` does NOT trigger `ON_CLOCK_OUT`.
- **SILENCE_CHARACTER Stat Integrity (`src/engine/abilities.ts`):**
  - Removed erroneous `baseCost` assignment to `maxStamina`.
  - Silencing strips abilities and keywords (`isFrontDeskGuard`, `isRush`, `isFirstResponder`, `isInfiltration`), marking `isSilenced`.
  - Preserves base Power, Stamina, current Stamina, permanent Gear bonuses, and temporary stamina buffers.
- **ON_DAMAGE_TAKEN Trigger Ordering (`src/engine/abilities.ts`, `src/engine/combat.ts`):**
  - Fired when damage actually reduces stamina, including lethal damage.
  - Enforced strict 5-step order: 1. Assign damage, 2. Dispatch ON_DAMAGE_TAKEN, 3. Resolve triggers, 4. SBA sweep, 5. Departure triggers.
- **Deterministic PRNG Engine (`src/engine/abilities.ts`, `src/engine/state.ts`):**
  - Replaced `instanceCounter` modulo with seeded Mulberry32 pseudo-random number generator.
  - State persisted in `GameState.rngState` (32-bit unsigned integer), surviving JSON serialization.
  - Completely avoids `Math.random()`.
- **Execution Context Isolation (`src/engine/abilities.ts`):**
  - Replaced module-level global variables (`globalTriggerDepth`, `globalExecutionCount`) with isolated `ExecutionContext`.
  - Multiple `GameState` instances resolve independently with zero cross-state limit pollution.
- **Temporary Stat Tracking & Clock Out Expiration (`src/engine/state.ts`, `src/engine/turn_manager.ts`):**
  - Added `temporaryEfficiencyBuffer` to `CardInstance`.
  - Added `duration: 'PERMANENT' | 'UNTIL_END_OF_TURN'` to `AbilityDefinition`.
  - Temporary Power and Stamina expire at Phase 5 Clock Out; permanent buffs persist.
- **Trigger Queue Resumption (`src/engine/actions.ts`, `src/engine/state.ts`):**
  - Added `state.pendingTriggerQueue` to store remaining triggers when an interactive targeting decision pauses resolution.
  - Triggers resume automatically upon executing `RESOLVE_ABILITY_TARGET`.
- **Automated Test Suite Expansion (`src/engine/tests/abilities_remediation.test.ts`):**
  - 17 new regression and edge-case unit tests.
  - Total automated tests: **122 tests across 40 suites (100% pass rate)**.

---

### [2.2.0-ALPHA-2C-A] — 2026-11-04
#### Milestone 2C-A: Card Ability Engine Implementation

#### Added & Implemented
- **Centralized Ability Resolution Engine (`src/engine/abilities.ts`):**
  - Fully declarative, data-driven ability execution without embedded card functions.
  - Complete lifecycle trigger support: `ON_PLAY`, `ON_DEPLOY`, `ON_CLOCK_OUT`, `ON_ATTACK`, `ON_DAMAGE_TAKEN`, `START_OF_SHIFT`, `END_OF_SHIFT`.
  - Canonical distinction: Hand deployment triggers both `ON_PLAY` and `ON_DEPLOY`; Queue resolution triggers only `ON_DEPLOY`; Queue reroute/discard triggers neither.
  - Atomic effect operations: `DAMAGE`, `HEAL_STAMINA`, `HEAL_MORALE`, `BUFF_STAT`, `DRAW_CARDS`, `DISCARD_CARDS`, `MODIFY_SHIFT`, `DISRUPT_QUEUE`, `SILENCE_CHARACTER`, `RETURN_TO_HAND`, `DESTROY_CHARACTER`.
  - Built-in Fizzle Guard: abilities resolve harmlessly if targets leave play before resolution.
  - Infinite cascade protection: `MAX_TRIGGER_DEPTH = 10` and `MAX_EXECUTION_BUDGET = 50`.
  - Standardized catalog with 17 canonical presets covering all workplace departments.
- **Interactive Ability Decision Pipeline (`src/engine/state.ts`, `src/engine/actions.ts`):**
  - `PendingAbilityTargetDecision` pauses progression and prompts active player for mandatory targeting choices.
  - Added `RESOLVE_ABILITY_TARGET` action to resolve pending decisions atomically.
  - Validates legal targets via `getLegalAbilityTargets` and `isTargetLegal`.
  - 100% JSON serialization/restoration fidelity across state snapshots.
- **Card Intake Compatibility Engine (`src/engine/card_importer.ts`):**
  - Safe schema validator for future Card Intake Tool import.
  - Rejects executable functions, script injection, and unknown mechanical tokens.
  - Segregates historical archive metadata (`LegacyCardArchive`) from gameplay models.
- **Option A Temporary Stamina Buffer Integration:**
  - Buffs augment current and max Stamina; damage absorbs from current stamina first.
  - Clamping occurs at Phase 5 (Clock Out) to $\min(\text{Current}, \text{BaseMax})$.
- **Automated Test Suite Expansion (`src/engine/tests/abilities.test.ts`):**
  - 21 comprehensive unit and integration tests added.
  - Entire engine suite expanded to **105 passing tests across 32 suites (100% pass rate)**.

---

### [2.1.0-ALPHA-2B] — 2026-11-03
#### Milestone 2B: Combat Engine Implementation

#### Added & Implemented
- **Centralized Combat Subsystem (`src/engine/combat.ts`):**
  - Simultaneous combat damage resolution: attacker and defender deal damage concurrently based on Efficiency.
  - Front Desk Guard priority enforcement across all 10 canonical targeting permutations.
  - Infiltration keyword bypass allowing direct targeting of non-guard characters or Supervisor Morale.
  - Deploy-turn attack differentiation: Rush attacks characters only; First Responder attacks characters or Morale; standard units suffer summoning sickness.
  - Direct Morale damage application and match completion detection at $\le 0$ Morale.
  - Rule 1.4 Mutual Defeat Law: Active turn player loses if both players reach $\le 0$ Morale simultaneously.
  - Interactive combat targeting pipeline (`INITIATE_ATTACK` $\rightarrow$ `PendingCombatTargetDecision` $\rightarrow$ `RESOLVE_COMBAT_TARGET`).
- **Automated Combat Test Suite (`src/engine/tests/combat.test.ts`):**
  - 20 unit and integration tests covering deployment, targeting, damage calculation, exhaustion, keywords, and multi-turn combat encounters.

---

### [2.0.0-ALPHA-2A] — 2026-11-02
#### Milestone 2A: Core Game Engine Foundation

#### Added & Implemented
- **Canonical Game State Model (`src/engine/state.ts`):**
  - Strongly typed, fully serializable `GameState`, `PlayerState`, `CardInstance`, and `CharacterSlot` data models.
  - Zero React, DOM, or UI dependencies — pure TypeScript architecture.
  - Strict zone management across Deck, Hand, Battlefield, Booking Queue, and Breakroom.
  - Zone invariants: exactly 30-card decks, max 2 copies per card ID, max 8 cards in hand, max 5 characters on battlefield, max 3 queue tickets.
  - Unique card instance ID generation guarantees across the match.
  - Deterministic serialization and deserialization via `serializeGameState` and `deserializeGameState`.
  - Config D (1 Master Key for P2) and Config E (2 Master Keys for P2) starting compensation support.
- **Turn & Phase Management Subsystem (`src/engine/turn_manager.ts`):**
  - Canonical 5-phase sequential lifecycle: `SHIFT_START` -> `SHIFT_BUDGETING` -> `ADMINISTRATIVE_DRAW` -> `OPERATIONAL_ACTION` -> `CLOCK_OUT`.
  - Shift capacity progression increments +1 per turn up to the hard ceiling of 10.
  - Phase 1 queue countdown decrement, 4-tier tie-breaking resolution, and Capacity Triage handling.
  - Phase 1 escrow refund promotion into active temporary Shift during Phase 2 budgeting.
  - Burnout fatigue progression ($1, 2, 3, 4\dots$ damage) on empty deck draws.
  - State-based action evaluation (Morale <= 0 defeat check, mutual defeat resolution, 0-stamina unit retirement).
- **Centralized Action Validation Subsystem (`src/engine/actions.ts`):**
  - Pure validator `validateAction` returning structured error codes (`NOT_ACTIVE_PLAYER`, `INVALID_PHASE`, `INSUFFICIENT_SHIFT`, `CARD_NOT_IN_HAND`, `BATTLEFIELD_FULL`, `QUEUE_FULL`, `MASTER_KEY_INVALID_PHASE`, `NO_MASTER_KEYS_REMAINING`, `SECOND_QUEUE_DISCOUNT_PROHIBITED`).
  - Pure reducer `executeAction` for legal actions (`PLAY_CARD`, `QUEUE_CARD`, `USE_MASTER_KEY`, `END_PHASE`, `CONCEDE`).
- **Engine Facade (`src/engine/index.ts`):**
  - Unified entry point exporting all types, state factories, validators, and turn functions.
- **Comprehensive Test Suite (`src/engine/tests/core_engine.test.ts`):**
  - 23 new automated unit and integration tests covering initialization, deck rules, zone constraints, phase transitions, action validation, fatigue progression, and state serialization.
  - Entire engine test suite expanded to **59 passing tests across 13 suites in 7 files (100% pass rate)**.

---

### [1.1.0-LOCKED] — 2026-11-02
#### Milestone 1B: Independent Audit, Balance Review & Rules Lock

#### Added & Published
- **New Deliverable Documents:**
  - `PHASE_1B_INDEPENDENT_AUDIT.md`: Inventory of real vs. simulated features, pacing validation, and critical analysis of Phase 1 assumptions.
  - `FINALIZED_GAME_RULES.md`: Canonical rules lock across all phases, turns, resources, and state-based actions.
  - `FINALIZED_COMBAT_RULES.md`: Authoritative combat laws, targeting laws, and persistent damage lifecycle.
  - `FINALIZED_BOOKING_QUEUE_RULES.md`: Complete queue rules with max 3 tickets per player, 1-Shift floor, and FIFO resolution.
  - `FINALIZED_BALANCE_MODEL.md`: Mathematical balance specification with defined variables and playtesting bounds.
  - `GAME_ENGINE_REQUIREMENTS.md`: Pure TypeScript engine architecture, `MAX_EXECUTION_STEPS = 25`, FIFO event queue, cycle detection.
  - `RULE_DECISION_LOG.md`: Comprehensive audit log recording approved, adjusted, rejected, and deferred decisions.
  - `THEME_AND_TERMINOLOGY_SYSTEM.md`: Full architectural separation of permanent internal IDs from display terminology.
- **Engine Simulations & Test Suite:**
  - Expanded `src/engine/balance.ts` with archetype definitions (`aggro`, `midrange`, `control`) and First-Player comparative simulation.
  - Added `src/engine/tests/simulation_validator.test.ts` testing 1-Shift floor, Influence tax calculation, 30-card deck distribution, and Config D advantage parity.

#### Key Adjustments & Corrections
- **Decoupled Influence from Combat:** Stripped damage mitigation from Influence; restricted Influence strictly to Queue priority, disruption defense, and Policy thresholds.
- **Phase 4 Renaming:** Renamed "Counter Action Phase" to "Operational Action Phase" to eliminate confusion with off-turn counter-spells.
- **Booking Queue Hard Limits:** Capped queue capacity at 3 active tickets per player and enforced a minimum effective cost floor of 1 Shift.
- **First-Player Configuration D Confirmed:** Proved Player 2 (5 cards + Master Key) achieves ~50% win parity compared to Player 1 (4 cards).
- **Battlefield Size Locked:** Evaluated 4, 5, 6, and 7 slots; locked at 5 character slots per player.

---

### [1.0.0-PROPOSAL] — 2026-11-01
#### Milestone 1: Foundation, Game Rules & Architecture Baseline

#### Added
- **Core Design Canon:**
  - Published `MASTER_GAME_DESIGN.md` defining core pillars, Humber College Booking Centre lore, session scope, and win conditions.
  - Published `OFFICIAL_RULEBOOK.md` establishing the 5-phase turn structure, attack targeting laws, Front Desk Guard mechanics, and simultaneous combat resolution.
  - Published `GAME_MECHANICS.md` elaborating the Shift System, Booking Queue ticket lifecycle, 4 card types, and 8 workplace affiliations.
  - Published `CARD_DATA_SCHEMA.md` with complete TypeScript interfaces for Cards, Legacy Archives, Abilities, and Firestore persistence.
  - Published `CARD_ABILITY_LIBRARY.md` specifying keyword rules (Front Desk Guard, Rush, First Responder, Divine Lanyard, Queue [N]) and 24 canonical abilities with infinite-loop prevention.
  - Published `CARD_BALANCE_GUIDELINES.md` detailing the Vanilla Stat curve `(Cost * 2) + 1`, Influence valuation, and the Booking Queue discount formula.
  - Published `TECHNICAL_ARCHITECTURE.md` establishing zero-React game engine decoupling, deterministic state machines, action validators, and local pass-and-play Privacy Handoff.
  - Published `DATABASE_SCHEMA.md` specifying Firestore collections (`cards`, `raw_cards`, `workshop_proposals`, `decks`) and security rules.
  - Published `UI_DESIGN_GUIDELINES.md` detailing the Hearthstone-inspired dark atmospheric battlefield layout, color tokens, and card anatomy.
  - Published `DEVELOPMENT_ROADMAP.md` mapping out the 6-phase engineering trajectory.
  - Published `TESTING_STRATEGY.md` outlining `node:test` unit testing, headless Monte Carlo balance bots, and Playwright UI validation.
  - Initialized `DEVELOPMENT_CHANGELOG.md`.

#### Resolved Design Decisions
- **Evaluated Shift System:** Confirmed 1-10 ramp curve with 30 Morale starting life total. Confirmed second-player compensation: 5-card opening hand + "The Master Key" (0-cost Incident granting +1 temporary Shift Hour).
- **Evaluated Booking Queue:** Formulated the Queue Discount Equation `EffectiveCost = BaseValue - (QueueTurns * 0.75)`, ensuring queued cards provide compelling tactical tempo advantages in exchange for delayed arrival.
- **Card Archive Integrity:** Architected strict separation between immutable legacy card photos/original jokes and verified playable game card models.
- **Local Play Privacy:** Designed the full-screen "Privacy Handoff Curtain" with explicit "Clock In" confirmation between player turns to prevent screen-peeking on a shared PC.
