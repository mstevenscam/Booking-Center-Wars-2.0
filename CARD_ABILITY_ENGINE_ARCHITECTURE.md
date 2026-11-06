# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
# CARD ABILITY ENGINE ARCHITECTURE SPECIFICATION
**Version:** 1.2.0-FINAL-REMEDIATED-ABILITY-ENGINE  
**Phase:** 2C-A Architectural Specification (Final Remediation)  
**Authority:** Core Game Systems & Rules Architecture  

---

## 1. ARCHITECTURAL PHILOSOPHY & OBJECTIVES

The Card Ability Engine in *Booking Wars* is a deterministic, data-driven, state-reactive resolution pipeline built in pure TypeScript without UI or external framework bindings.

### Core Architectural Pillars
1. **Data-Driven Declarative Execution:** Cards never contain executable functions, lambda closures, or arbitrary JavaScript. Cards declare structured `AbilityDefinition` payloads referencing canonical mechanical IDs.
2. **Atomic Resolution with Fizzle Protection:** Effects execute atomically. If an intended target is removed or clocked out before resolution, the effect fizzles safely without throwing errors or causing partial mutations.
3. **Deterministic FIFO Queue & Trigger Stack Resumption:** Triggered abilities queue and resolve in strict first-in, first-out (FIFO) order. If an interactive decision pauses resolution, remaining abilities are preserved in `state.pendingTriggerQueue` alongside their `ExecutionContext` and resume sequentially once the decision is resolved.
4. **Infinite Cascade Safeguards with Context Isolation:**
   - Stack Depth Limit: `MAX_TRIGGER_DEPTH = 10`.
   - Execution Budget Limit: `MAX_EXECUTION_BUDGET = 50`.
   - Local `ExecutionContext` instances (`{ depth: number; budgetCount: number }`) isolate limits per resolution chain; zero shared mutable global module state. Independent matches resolve with zero cross-state contamination.
   - The 50-operation budget is preserved across pause/resume cycles and cannot be bypassed.
5. **Interactive Pending Decisions:** Targeted abilities that require player choice pause the game engine via `PendingAbilityTargetDecision`, preserving game state and surviving JSON serialization/restoration.
6. **Separation of Legacy Archive vs. Engine Mechanics:** Original card names, artwork, humor, and flavor are isolated from competitive rule evaluation, facilitating ingestion via the external Card Intake Tool.
7. **Deterministic Seeded PRNG (Standard Mulberry32):** The standard Mulberry32 algorithm stored in `GameState.rngState` replaces `Math.random()`. State progression advances strictly by `+0x6D2B79F5 >>> 0` on every step while preserving seed sequence fidelity and JSON serialization.

---

## 2. CANONICAL TAXONOMY & TYPES

### 2.1 Trigger Conditions (`TriggerCondition`)
| Trigger | Mechanical Definition | Firing Context |
| :--- | :--- | :--- |
| `ON_PLAY` | Manually cast from hand during Phase 4 (`OPERATIONAL_ACTION`) by paying regular Shift cost. | Fired in `executeAction` (`PLAY_CARD`/`DEPLOY_CARD`). |
| `ON_DEPLOY` | Physically entering the Front Counter (`BATTLEFIELD`), including hand play, Booking Queue resolution, and resummoning. | Fired upon battlefield entry (`PLAY_CARD`, queue resolution, Triage Option 1). |
| `ON_CLOCK_OUT` | Character departs the battlefield for the Breakroom due to Stamina reaching $\le 0$ or direct destruction (`DESTROY_CHARACTER`). | Fired during State-Based Action sweep (`evaluateStateBasedActions`) or direct destruction. Departing card snapshot captured before removal. Duplicate prevention enforced via `hasTriggeredClockOut`. Does NOT fire for `RETURN_TO_HAND`. |
| `ON_ATTACK` | Attacking unit declares combat against an enemy unit or opposing Supervisor Morale. | Fired in `executeAttack` immediately after exhaustion. |
| `ON_DAMAGE_TAKEN`| Character takes combat or ability damage and Stamina is reduced (including lethal damage). | Fired following damage assignment in `executeCombatResolution` and `resolveAbilityEffect`. |
| `START_OF_SHIFT` | Beginning of active player's turn (Phase 1: Shift Start). | Fired in `executeShiftStart` after readying friendly units. |
| `END_OF_SHIFT` | Conclusion of active player's turn (Phase 5: Clock Out). | Fired in `executeClockOut` prior to temporary resource expiration. |

> **Critical Distinction (Phase 1B Rule Lock):**  
> Rerouting a queued ticket to hand via Capacity Triage Option 2 (`REROUTE_TO_HAND`) or discarding via Option 3 (`DISCARD_TO_BREAKROOM`) enters `HAND` or `BREAKROOM` respectively, **never triggering `ON_PLAY` or `ON_DEPLOY`**.

---

### 2.2 Standardized Effect Operations (`EffectType`)
| Effect ID | Operation Description | Failure / Clamping Rules |
| :--- | :--- | :--- |
| `DAMAGE` | Subtracts numeric damage from character Stamina or Supervisor Morale. | Floor at 0. Triggers `ON_DAMAGE_TAKEN` (lethal & non-lethal). If character hits 0, clocks out via SBAs. Supports direct damage to `BOTH_SUPERVISORS`. |
| `HEAL_STAMINA` | Restores Stamina to a friendly character. | Capped at target's current `maxStamina`. Cannot heal above max. |
| `HEAL_MORALE` | Restores Morale to the friendly Supervisor. | Capped at `maxMorale` (30). |
| `BUFF_STAT` | Grants Efficiency (Power) and/or Stamina bonuses. | Supports `duration: 'PERMANENT' \| 'UNTIL_END_OF_TURN'`. Permanent buffs adjust base maximums. Temporary buffs track in `temporaryEfficiencyBuffer` and `temporaryStaminaBuffer`, expiring at Phase 5 Clock Out. |
| `DRAW_CARDS` | Draws cards from player's deck pile. | Respects hand ceiling (8). Excess cards burn to Breakroom. Empty deck advances Burnout Fatigue. |
| `DISCARD_CARDS` | Discards cards from hand to Breakroom. | Safe bounds check; ignores empty hand. |
| `MODIFY_SHIFT` | Alters temporary or current Shift hours. | Positive values grant temporary Shift. Negative values decrement spendable Shift. |
| `DISRUPT_QUEUE` | Accelerates (`-N`) or delays (`+N`) Booking Queue countdowns. | Floor at 0. Cannot cause tickets to enter negative remaining turns. |
| `SILENCE_CHARACTER`| Strips all abilities and designated keywords (`isFrontDeskGuard`, `isRush`, `isFirstResponder`, `isInfiltration`, `hasOnDeployAbility`), clears temporary buffers, and resets unit to base card template statistics. | Preserves card identity and ownership. Clamps damaged current stamina to base max without healing past damage. Unit cannot trigger abilities. Does NOT create a departure event. |
| `RETURN_TO_HAND` | Bounces character to owner's hand. | Completely restores card-template statistics (`baseTemplate`), clears temporary buffers, and removes permanent buffs. If hand is at cap 8, burns to Breakroom. Does NOT fire `ON_CLOCK_OUT`. |
| `DESTROY_CHARACTER`| Retires unit directly to Breakroom without combat damage. | Directly transitions unit to Breakroom and triggers `ON_CLOCK_OUT` departure event. |

---

### 2.3 Option A Temporary Stamina Model (Approved Specification)

The canonical Option A model operates as follows:
1. **Application:** Temporary Stamina increases `currentStamina` and `maxStamina` for the designated duration, with the delta recorded in `temporaryStaminaBuffer`.
2. **Damage Assignment:** Damage (combat, incident, or ability) directly reduces `currentStamina` (`stamina = Math.max(0, stamina - dmg)`).
3. **Expiration at Clock Out (Phase 5):** The temporary maximum-Stamina increase is removed (`maxStamina = Math.max(1, maxStamina - temporaryStaminaBuffer)`).
4. **Clamping:** Current Stamina is clamped to the remaining maximum:
   $$\text{Stamina}_{\text{end}} = \min(\text{Current Stamina}, \text{Remaining Max Stamina})$$
5. `temporaryStaminaBuffer` is reset to 0.

---

### 2.4 Targeting Filters (`TargetFilter`) & Validation Pipeline
Every target is evaluated through `isTargetLegal(state, actingPlayerId, filter, target, sourceInstanceId, context)`:
- `SELF`: Target must be `{ type: 'SELF' }` or `{ type: 'CHARACTER' }` matching `sourceInstanceId`, physically present on friendly battlefield with Stamina $> 0$.
- `ANY_FRIENDLY_CHARACTER`: `{ type: 'CHARACTER' }` present on friendly battlefield with Stamina $> 0$.
- `ANY_ENEMY_CHARACTER`: `{ type: 'CHARACTER' }` present on opponent battlefield with Stamina $> 0$.
- `ALL_FRIENDLY_CHARACTERS`: `{ type: 'ALL_FRIENDLY' }`.
- `ALL_ENEMY_CHARACTERS`: `{ type: 'ALL_ENEMY' }`.
- `ALL_CHARACTERS`: `{ type: 'ALL_CHARACTERS' }`.
- `FRIENDLY_SUPERVISOR`: `{ type: 'SUPERVISOR', playerId: actingPlayerId }`.
- `ENEMY_SUPERVISOR`: `{ type: 'SUPERVISOR', playerId: opponentId }`.
- `BOTH_SUPERVISORS`: `{ type: 'BOTH_SUPERVISORS' }`.
- `PENDING_QUEUE_TICKET`: `{ type: 'QUEUE_TICKET', ticketId, ownerId: opponentId }`, verified to exist in opponent's queue.
- `ALL_FRIENDLY_QUEUE`: `{ type: 'ALL_QUEUE' }`.
- `RANDOM_ENEMY_CHARACTER`: `{ type: 'NONE' }` (resolved deterministically via Mulberry32).
- `RANDOM_FRIENDLY_CHARACTER`: `{ type: 'NONE' }` (resolved deterministically via Mulberry32).
- `ATTACKER`: `{ type: 'CHARACTER' }` matching `context.attackerSlot` on opponent battlefield, or `{ type: 'NONE' }`.
- `ANY_TARGET`: `{ type: 'SUPERVISOR' }` or valid character on either battlefield with Stamina $> 0$.

---

## 3. INTERACTIVE DECISION PIPELINE & SERIALIZATION

When an ability requires player choice (`requiresManualTarget: true`), the engine branches from atomic execution:

```
[Trigger Fired]
       │
       ▼
[requiresManualTarget?]
 ├── No  ──► [Atomic Resolution] ──► [SBA Sweep] ──► [Events Logged]
 └── Yes ──► [Generate Legal Targets via isTargetLegal]
                   │
                   ▼
       [Create PendingAbilityTargetDecision + Attach ExecutionContext]
       [Queue Remaining Triggers in pendingTriggerQueue + Attach ExecutionContext]
                   │
                   ▼
         [Pause Engine State] (Reject any non-resolution actions)
                   │
                   ▼
         [Action: RESOLVE_ABILITY_TARGET]
                   │
                   ▼
         [Revalidate Target via isTargetLegal]
         [Execute Primary Ability with Preserved ExecutionContext]
                   │
                   ▼
         [Drain pendingTriggerQueue with Preserved ExecutionContext]
```

### Invariants:
1. `ExecutionContext` survives serialization cleanly as `{ depth: number; budgetCount: number }`.
2. Resuming execution continues from the accumulated `budgetCount`.
3. If a resumed trigger also requires manual targeting, it pauses again with the updated `ExecutionContext`.
4. The 50-operation budget cannot be circumvented by pausing and resuming.
