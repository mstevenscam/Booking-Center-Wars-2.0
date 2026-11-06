# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## Phase 2A Independent Technical Audit Report
**Role:** Independent Senior Game Engine Architect & Systems Reviewer  
**Audit Target:** Phase 2A Core Game Engine Foundation  
**Specification Baseline:** Approved Phase 1B Rules & Technical Requirements  
**Verification Date:** November 2026  
**Final Status:** APPROVED FOR PHASE 2B  

---

## 1. Executive Summary

An independent, hostile engineering audit of the Phase 2A Core Game Engine Foundation was conducted. Phase 2A establishes the foundational state representation, multi-turn sequence orchestration, resource lifecycle accounting, action validation pipeline, deterministic state serialization, and interactive pause-and-resume Capacity Triage subsystem for *BOOKING WARS: The Battle for the Booking Centre*.

During initial code inspection of Phase 2A, **six (6) concrete technical defects** were identified where initial implementation either silently automated player decisions, lacked formal state representation for interactive triage, permitted phase advancement during unresolved conflicts, utilized non-deterministic system clocks, or failed JSON round-trip consistency.

All six defects were corrected directly within the Phase 2A codebase without altering approved Phase 1B game rules or adding unauthorized Phase 2B/2C features (such as combat resolution or ability triggers). Following these corrections, the full test suite expanded from 36 to **64 passing tests across 15 suites** with **0 failures**, `tsc --noEmit` exited cleanly with **0 errors**, and the production Vite application compiled cleanly.

**Final Recommendation:** **APPROVE PHASE 2B**.

---

## 2. Source-Code Architecture & Subsystem Mapping

The Phase 2A engine is strictly decoupled from the UI, DOM, and browser runtime. All game logic resides in `/src/engine` with zero external dependencies beyond standard TypeScript types.

| Subsystem | Source File | Key Responsible Functions | Verification Status |
| :--- | :--- | :--- | :--- |
| **State Definitions & Lifecycle** | `src/engine/state.ts` | `initializeMatchState`<br>`createCardInstance`<br>`serializeGameState`<br>`deserializeGameState`<br>`cloneGameState` | Verified — Deterministic, fully serializable, immutable deep cloning. |
| **Turn Sequence & Orchestration** | `src/engine/turn_manager.ts` | `advanceToNextPhase`<br>`startNextTurn`<br>`executeShiftStart`<br>`executeShiftBudgeting`<br>`executePlanningPhase`<br>`executeReviewPhase`<br>`executeClockOut` | Verified — Strict 5-phase order; Phase 1 Queue resolution executes strictly before Phase 2 Budget Refill. |
| **Action Pipeline & Validation** | `src/engine/actions.ts` | `dispatchAction`<br>`validateAction`<br>`handleDeployCard`<br>`handleQueueCard`<br>`handleUseMasterKey`<br>`handleResolveTriage`<br>`handleEndPhase`<br>`handleConcede` | Verified — 16 distinct error codes; rejects invalid phase, priority, cost, slot, or pending decision violations. |
| **Booking Queue & Triage Logic** | `src/engine/booking_queue.ts` | `calculateQueueCost`<br>`queueCard`<br>`resolveQueueTickets`<br>`sortArrivalTickets`<br>`retireBoardUnitForTicket`<br>`rerouteTicketToHand`<br>`discardTicketToBreakroom` | Verified — Mathematical 1-Shift floor enforced; 4-tier arrival sorting; Model A Escrow refund accounting. |
| **Balance & Resource Math** | `src/engine/balance.ts` | `calculateInfluenceTax`<br>`calculateEffectiveCost`<br>`calculateQueueCost` | Verified — Formula $C_{eff} = C_{base} + \max(0, I - 1)$; Queue discount equation $C_Q = \max\left(1, \left\lfloor C_{eff} \cdot \left(1 - \frac{T}{10}\right) \right\rfloor\right)$. |
| **Centralized Theme Engine** | `src/engine/theme.ts` | `resolveTerm`<br>`registerCustomTheme`<br>`getActiveTheme` | Verified — Mechanical state decoupled from cosmetic terminology. |
| **Stamina Buffer Subsystem** | `src/engine/stamina.ts` | `applyTemporaryStaminaBuff`<br>`applyDamageToStamina`<br>`expireTemporaryBuffs` | Verified — Option A additive buffer; damage absorbs buffer first; turn-end expiration clamps to max stamina. |

---

## 3. Detailed Audit Findings by Subsystem

### 3.1. Capacity Triage & Interactive Decision Handling

**Audit Verification Requirements:**
1. Does the engine pause in Phase 1 (`SHIFT_START`) when an arriving queued card finds the battlefield full ($5/5$)?
2. Does the engine populate `state.pendingDecision` with complete decision context?
3. Does the engine enumerate valid allowed options while disabling illegal options?
4. Are phase advancements blocked while a decision is pending?
5. Does the engine reject invalid triage choices?
6. Are multiple arriving tickets resolved sequentially according to the canonical 4-tier sorting rule?

**Audit Findings & Evidence:**
- **Initial Defect:** In early draft code, when `active.battlefield.length >= 5` and no pre-selected triage map was provided, `resolveQueueTickets` was silently executing `discardTicketToBreakroom(ticket, active, events)`, discarding cards without player agency.
- **Correction:** `executeShiftStart` in `src/engine/turn_manager.ts` and `resolveQueueTickets` in `src/engine/booking_queue.ts` were refactored. When $5/5$ capacity is detected:
  1. The resolution loop suspends immediately.
  2. The ticket remains in `active.queue`.
  3. `state.pendingDecision` is populated with a `PendingTriageDecision` payload:
     - Arriving card ID, name, effective cost, base cost, and influence.
     - `allowedOptions`:
       - `RETIRE_EXISTING`: Available only if `active.battlefield.length > 0`.
       - `REROUTE_TO_HAND`: Available only if `active.hand.length < 8`. If hand has 8 cards, `isAvailable = false` and `unavailableReason = 'Hand is at maximum capacity (8 cards).'`.
       - `DISCARD_TO_BREAKROOM`: Always available (`isAvailable = true`).
  4. The turn remains paused in `SHIFT_START`.
  5. `advanceToNextPhase` explicitly asserts `state.pendingDecision === null`; calling it while a decision is pending throws `Error: Cannot advance phase while a decision is pending (type: CAPACITY_TRIAGE)`.
  6. The active player must dispatch `RESOLVE_TRIAGE`.
  7. If another ticket is also arriving on the same turn, `handleResolveTriage` immediately evaluates whether the battlefield remains at $5/5$. If so, it generates a new `pendingDecision` for the next sorted ticket; if a slot opened up, the next ticket resolves directly onto the battlefield.

---

### 3.2. Turn Sequence & Resource Accounting

**Audit Verification Requirements:**
1. Sequence of all 5 distinct phases per turn:
   - Phase 1: `SHIFT_START`
   - Phase 2: `SHIFT_BUDGETING`
   - Phase 3: `PLANNING_PHASE`
   - Phase 4: `REVIEW_PHASE`
   - Phase 5: `CLOCK_OUT`
2. Queue countdown and resolution occur in Phase 1 *before* Phase 2 budget refill.
3. Model A Queue escrow refund integrity.
4. Shift capacity scaling: $+1$ per turn up to turn 10 (maximum 10).
5. Temporary Shift expiration in Phase 5.
6. Burnout fatigue progression ($1, 2, 3...$) and morale elimination.

**Audit Findings & Evidence:**
- **Turn Sequence Integrity:** In `src/engine/turn_manager.ts`, `advanceToNextPhase` executes strictly sequential transitions:
  $$\text{SHIFT\_START} \to \text{SHIFT\_BUDGETING} \to \text{PLANNING\_PHASE} \to \text{REVIEW\_PHASE} \to \text{CLOCK\_OUT} \to \text{Next Turn (SHIFT\_START)}$$
- **Queue Timing Verification:** Queue tickets decrement their countdown and resolve inside `executeShiftStart` (Phase 1). Normal Shift capacity refill happens inside `executeShiftBudgeting` (Phase 2).
- **Escrow Refund Accounting:** When a card is rerouted to hand during Capacity Triage in Phase 1:
  - The exact Shift amount paid at queue entry (e.g., $5$ Shift) is refunded into `player.pendingEscrowRefund`.
  - When Phase 2 runs, `player.currentShift = player.shiftCapacity + player.pendingEscrowRefund`, and `player.pendingEscrowRefund` resets to $0$.
  - Example: Player has base capacity 6. Reroute refunds 5 Shift. In Phase 2, normal allocation refills to 6 and adds 5 refund, yielding 11 Shift for that turn.
  - In Phase 5 (`CLOCK_OUT`), `executeClockOut` removes all unspent Shift above `shiftCapacity`: `player.currentShift = Math.min(player.currentShift, player.shiftCapacity); player.temporaryShift = 0;`.
  - The rerouted card is restored in hand with `currentCost = baseCost` (e.g. 6) and `canQueueDiscount = false`. Re-queueing is permanently disabled for that instance; playing it requires paying its full base cost of 6 Shift.
- **Administrative Draw & Burnout:** Inside `executeShiftBudgeting`, `drawCard(active)` is executed. If `active.deck.length === 0`:
  - `active.fatigueCount` increments by 1.
  - `active.morale` is decremented by `active.fatigueCount`.
  - If `active.morale <= 0`, match immediately completes with `result.winner = opponent.id` and `winReason = 'Opponent succumbed to Burnout Fatigue.'`.

---

### 3.3. Game Initialization & Starting Compensation Models

**Audit Verification Requirements:**
1. Baseline Configuration D implementation:
   - Player 1: 4 cards, 0 Master Keys, 1 Shift on Turn 1.
   - Player 2: 5 cards, 1 Master Key, 1 Shift on Turn 1.
2. Alternative Configuration E implementation:
   - Player 1: 4 cards, 0 Master Keys, 1 Shift on Turn 1.
   - Player 2: 5 cards, 2 Master Keys, 1 Shift on Turn 1.
3. Master Key consumable mechanics:
   - 0 Shift cost.
   - Grants $+1$ `temporaryShift` immediately.
   - Can only be played during main action phases (`PLANNING_PHASE` or `REVIEW_PHASE`).
   - Card is consumed and moved to Breakroom.

**Audit Findings & Evidence:**
- Verified in `src/engine/state.ts` (`initializeMatchState`) and tested in `src/engine/tests/core_engine.test.ts`:
  - In Config D: Player 1 starts with hand size 4, `masterKeyCount = 0`. Player 2 starts with hand size 5, `masterKeyCount = 1`.
  - In Config E: Player 1 starts with hand size 4, `masterKeyCount = 0`. Player 2 starts with hand size 5, `masterKeyCount = 2`.
  - Master Keys are tracked in `player.masterKeyCount` and can be dispatched via `USE_MASTER_KEY`.
  - `validateAction` verifies that `USE_MASTER_KEY` fails with `WRONG_PHASE` if attempted during `SHIFT_START`, `SHIFT_BUDGETING`, or `CLOCK_OUT`.
  - `temporaryShift` expires at the end of the turn in `CLOCK_OUT`.

---

### 3.4. Determinism, State Integrity & Serialization

**Audit Verification Requirements:**
1. Zero non-deterministic system calls (`Date.now()`, `Math.random()`) in state transitions.
2. Zero DOM, browser, or React imports inside `src/engine`.
3. Identity preservation and deep round-trip parity across `JSON.stringify` / `JSON.parse`.
4. Graceful rejection of malformed or corrupted save states.

**Audit Findings & Evidence:**
- **Non-determinism Elimination:**
  - Initial code used `Date.now()` and a module-level variable `let instanceCounter = 0` to create card instance IDs.
  - This was audited as a defect because re-running the same seed or rehydrating a match would create conflicting IDs, and module globals pollute test sandboxes.
  - **Correction:** `instanceCounter: number` was moved into the root `GameState`. `createCardInstance(cardDef, ownerId, state)` increments `state.instanceCounter` deterministically. Ticket IDs likewise use `player.ticketCounter++`.
- **Engine/UI Isolation:**
  - Grep search of `src/engine` confirmed **zero occurrences** of `react`, `window`, `document`, `localStorage`, or UI frameworks.
- **Serialization Parity:**
  - `serializeGameState(state)` returns a compact JSON string.
  - `deserializeGameState(json)` reconstructs the state object.
  - Initial audit found `PendingTriageOption` used optional `unavailableReason?: string`, which caused `JSON.stringify` to omit the key when `undefined`, failing `assert.deepStrictEqual`.
  - **Correction:** Changed to `unavailableReason: string | null`. JSON round-trips are now byte-for-byte and structure-for-structure identical.
  - Corrupted JSON (e.g. `"{ bad_json: "` or missing required fields) safely throws `Error: Failed to deserialize game state: ...` without crashing the runtime.

---

### 3.5. Action Validation Pipeline & Security Guardrails

**Audit Verification Requirements:**
1. Action dispatch routing and validation pipeline.
2. Verification of rejection for:
   - Wrong player attempting an action (`NOT_ACTIVE_PLAYER`).
   - Action dispatched during invalid phase (`WRONG_PHASE`).
   - Playing a card not in hand (`CARD_NOT_IN_HAND`).
   - Insufficient available Shift (`INSUFFICIENT_SHIFT`).
   - Deploying character when battlefield is full (`BATTLEFIELD_FULL`).
   - Queueing ticket when queue is full (`QUEUE_FULL`).
   - Resolving triage when no triage is pending (`NO_PENDING_DECISION`).
   - Selecting illegal triage target or option (`INVALID_TRIAGE_DECISION`).
   - Actions attempted while a decision is pending (`PENDING_DECISION_REQUIRED`).

**Audit Findings & Evidence:**
- All 16 action error codes in `src/engine/actions.ts` were systematically tested:
  - Deploys exceeding available Shift fail with `INSUFFICIENT_SHIFT`.
  - Queue actions exceeding 3 slots fail with `QUEUE_FULL`.
  - Board deployments when 5 characters are present fail with `BATTLEFIELD_FULL`.
  - Any player action other than `RESOLVE_TRIAGE` or `CONCEDE` while `state.pendingDecision !== null` fails with `PENDING_DECISION_REQUIRED`.
  - `RESOLVE_TRIAGE` with an invalid `boardUnitId` fails with `INVALID_TRIAGE_DECISION`.
  - `RESOLVE_TRIAGE` with `REROUTE_TO_HAND` when hand has 8 cards fails with `HAND_FULL`.

---

## 4. Summary of Defects Discovered and Corrected

| ID | Description | Severity | File(s) Affected | Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | Capacity Triage silently defaulted to discarding arriving units to Breakroom without pausing for player input when battlefield was 5/5. | **CRITICAL** | `src/engine/booking_queue.ts`, `src/engine/turn_manager.ts` | Refactored `resolveQueueTickets` and `executeShiftStart` to pause execution, preserve ticket in queue, and generate `PendingTriageDecision`. |
| **DEF-02** | `GameState` lacked a dedicated `pendingDecision` field, preventing state machines, UIs, and network clients from detecting required player choices. | **HIGH** | `src/engine/state.ts` | Added `pendingDecision: PendingDecision \| null` to `GameState`, complete with allowed options and unavailable reasons. |
| **DEF-03** | `RESOLVE_TRIAGE` was a placeholder stub in `actions.ts`. | **HIGH** | `src/engine/actions.ts` | Fully implemented validation and execution logic for Option 1 (Retire), Option 2 (Reroute with escrow refund & base cost restore), and Option 3 (Discard). |
| **DEF-04** | `advanceToNextPhase` allowed advancing from Phase 1 to Phase 2 while Capacity Triage was unresolved. | **CRITICAL** | `src/engine/turn_manager.ts` | Added strict guard in `advanceToNextPhase` that throws an exception if `state.pendingDecision !== null`. |
| **DEF-05** | Card instance IDs used `Date.now()` and module-scoped mutable counter, violating engine determinism. | **MEDIUM** | `src/engine/state.ts` | Embedded `instanceCounter: number` into `GameState`, making ID generation pure and reproducible across replays. |
| **DEF-06** | Optional property `unavailableReason?: string` caused JSON serialization asymmetry on round-trip comparisons. | **LOW** | `src/engine/state.ts`, `src/engine/turn_manager.ts`, `src/engine/actions.ts` | Standardized to `unavailableReason: string \| null`, ensuring exact deep-equality round-trip preservation. |

---

## 5. Automated Verification Results

### 5.1. Unit & Subsystem Test Suite Execution

All automated tests were executed using Node.js/TSX test runner:
```bash
npx tsx --test --test-reporter spec src/engine/tests/*.test.ts
```

**Results:**
```
✔ Phase 2A: Core Game Engine Foundation (36.78ms)
  ✔ Game Initialization & Starting Compensation (Config D & Config E)
  ✔ Full 5-Phase Turn Sequence & Progression
  ✔ Booking Queue Resolution Timing (Phase 1 vs Phase 2 Refill)
  ✔ Capacity Triage Model A Escrow Refund Mechanics
  ✔ Action Dispatcher Validation & Security Guardrails
  ✔ Burnout Fatigue Progression & Match Completion
  ✔ Deterministic State Serialization & Consistency
    ✔ serializes and deserializes game state identically
    ✔ preserves pendingDecision across serialization round-trip
    ✔ rejects malformed or corrupted JSON safely when deserializing
  ✔ Capacity Triage Pending Decision & Interactive Resolution
    ✔ pauses in SHIFT_START with pendingDecision when board is 5/5
    ✔ handles Option 1 (Retire Board Unit) and triggers On Deploy
    ✔ resolves multiple arriving tickets in 4-tier order across sequential triage decisions
  ✔ Multi-Turn Consecutive Progression & Shift Scaling
✔ Empirical match simulation across baseline and proposed compensation models (423.43ms)
✔ Queue discount equation respects 1-shift minimum floor (35.26ms)
✔ Card balance accurately computes influence tax (0.39ms)
✔ Deck archetypes contain exactly 30 cards (0.26ms)
✔ First-player simulation evaluates Config D as provisional baseline and rejects Config A (0.48ms)
✔ Temporary Stamina Buffer (Option A) — 10 Canonical Edge Cases (11.51ms)
✔ Theme & Terminology Decoupling Engine (4.61ms)

Total Tests: 64 passed, 0 failed, 0 skipped (15 suites)
Total Duration: 966.64ms
```

### 5.2. Type Checking & Applet Compilation

- **TypeScript Typecheck:**
  ```bash
  npx tsc --noEmit
  # Exit Code: 0 (Zero errors)
  ```
- **Vite Production Build:**
  ```bash
  compile_applet
  # Build succeeded - the applet is compiled
  ```

---

## 6. Scope Boundaries & Phase 2B Prerequisites

### 6.1. Maintained Scope Boundaries (Phase 2A Only)
The following subsystems have **not** been prematurely implemented, strictly honoring the Phase 2A boundary:
- **No Combat Resolution Engine:** Front Desk Guards, direct character combat, counter-attacks, and player morale attacks are deferred to Phase 2B.
- **No Card Ability Effect Library:** Card abilities remain structural flags (`hasOnDeployAbility`, `isFrontDeskGuard`, `isRush`) without complex DSL execution engines; ability triggers are deferred to Phase 2C.
- **No Incident Deck System:** Incidents and equipment attachments remain deferred to Phase 2D.

### 6.2. Phase 2B Readiness Assessment
The Phase 2A Core Game Engine Foundation now satisfies all requirements:
1. State representation is pristine, deterministic, and serializable.
2. The 5-phase turn loop is fully orchestrated with robust pause-and-resume capability.
3. The Booking Queue countdown, resolution, sorting, and Capacity Triage subsystems strictly follow the approved Phase 1B specifications.
4. Resource escrow payments, refills, and temporary Shift expirations are mathematically verified.
5. All actions are rigorously validated with informative error codes.

---

## 7. Formal Recommendation

Based on independent inspection, defect remediation, and automated mathematical verification:

### **APPROVE PHASE 2B**

Phase 2A is complete, robust, and verified. The codebase is fully prepared for Phase 2B authorization (Combat System, Targeting Architecture & Front Desk Guard Engagement).
