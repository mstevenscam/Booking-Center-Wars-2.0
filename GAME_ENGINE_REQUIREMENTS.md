# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## GAMEPLAY ENGINE SPECIFICATION & ARCHITECTURAL REQUIREMENTS
**Document ID:** ENG-SPEC-2026.2  
**Target Module:** `src/engine/` (Pure TypeScript, Zero External DOM/React Dependencies)  
**Status:** Canonical & Locked for Phase 2 Implementation  

---

### 1. CORE ARCHITECTURAL DIRECTIVES
1. **Zero Framework Coupling:** The engine must compile and execute in any standard TypeScript environment (Node.js, Web Worker, or browser). It imports **zero modules from `react`, `react-dom`, or browser DOM globals**.
2. **Deterministic State Machine:** The game state is completely immutable. Given an identical `InitialState` and sequence of `GameAction`s, the engine will ALWAYS arrive at the exact same `FinalState` and `GameEvent` log.
3. **Frontend Subordination:** The UI NEVER determines if an action is legal, never computes combat damage, and never alters resources. The UI merely translates user gestures into `GameAction` envelopes and dispatches them to `dispatch(action)`.

---

### 2. ABILITY RESOLUTION ENGINE & INFINITE LOOP DEFENSES

The ability engine does not rely solely on recursion call-stack depth. It implements a multi-tiered defense system:

```
┌──────────────────────────────────────────────────────────────┐
│                    PLAYER ACTION DISPATCH                    │
│   e.g. Play Card / Declare Attack                            │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   ACTION VALIDATOR PIPELINE                  │
│   - Enough Shift?                                            │
│   - Valid Phase?                                             │
│   - Legal Target? (Front Desk Guard Check)                   │
└──────────────────────────────┬───────────────────────────────┘
                               │ Legal
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  DETERMINISTIC EVENT QUEUE                   │
│   - Steps Counter: stepCount = 0                             │
│   - MAX_EXECUTION_STEPS = 25                                 │
│   - FIFO Trigger Processing Loop                             │
│   - Cycle Detector (Detects A -> B -> A loops)               │
│   - Target Fizzle Guard (Silently drops invalid targets)     │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  STATE-BASED ACTIONS (SBA)                   │
│   - Evaluates Current Stamina <= 0 -> Clocks Out             │
│   - Evaluates Morale <= 0 -> Victory Trigger                 │
│   - Emits Animation Events to UI Stream                      │
└──────────────────────────────────────────────────────────────┘
```

#### 2.1 Defense 1: Hard Step Budget (`MAX_EXECUTION_STEPS = 25`)
Every dispatched player action has a maximum budget of **25 internal resolution steps**. If cascading triggers exceed 25 steps, the engine halts the trigger chain, logs a `CASCADE_LIMIT_REACHED` event, and continues execution, preventing browser freeze.

#### 2.2 Defense 2: FIFO Trigger Queue & Cycle Detection
Instead of deep recursive function calls, triggers push payload envelopes into an internal FIFO queue (`triggerQueue: EffectPayload[]`).
- The engine checks a visited set of `(sourceEntityId, eventKind, targetEntityId)` tuples.
- If the exact same tuple appears twice within a single action chain, it is flagged as a circular self-trigger and dropped.

#### 2.3 Defense 3: Once-Per-Turn & Once-Per-Game Flags
Card state tracking includes activation counters:
```typescript
interface CardActivationState {
  hasAttackedThisTurn: boolean;
  abilitiesUsedThisTurn: Record<string, number>; // abilityId -> count
  hasTriggeredOncePerGame: Record<string, boolean>;
}
```

#### 2.4 Defense 4: Target Fizzle Guard
When an ability in the trigger queue targets an entity, the engine re-validates the target immediately before applying the effect. If the target has already clocked out or been returned to hand, the effect **fizzles cleanly** without throwing an exception.

---

### 3. PURE ENGINE MODULE STRUCTURE (PHASE 2 DIRECTORY MAP)

```
src/engine/
  ├── state.ts               // Immutable GameState & PlayerState types
  ├── constants.ts           // Stable internal IDs & numeric constants
  ├── balance.ts             // Vanilla curve, queue discount, stat evaluation
  ├── validator.ts           // Comprehensive legality checker for all actions
  ├── reducer.ts             // Pure state transition function (state, action) => state
  ├── combat.ts              // Simultaneous damage & Front Desk Guard rules
  ├── queue.ts               // Booking Queue tick down & resolution logic
  ├── abilities/
  │     ├── primitives.ts    // Atomic effect executors (Damage, Heal, Buff, Draw)
  │     ├── catalog.ts       // 24 verified canonical ability definitions
  │     └── resolver.ts      // FIFO queue, cycle detector, SBA evaluator
  └── tests/
        ├── balance.test.ts  // Math validation tests
        ├── combat.test.ts   // Attack legality & persistent damage tests
        ├── queue.test.ts    // Ticket countdown & priority tests
        └── loops.test.ts    // Loop defense & step budget verification tests
```
