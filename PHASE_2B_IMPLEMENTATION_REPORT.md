# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## Phase 2B Implementation Report: Combat Engine
**Authority:** Lead Game Design Studio & Combat Systems Architecture  
**Document ID:** PHASE-2B-REPORT-2026.1  
**Status:** IMPLEMENTATION COMPLETE & VERIFIED  
**Date:** November 2026  

---

## 1. Executive Summary

Phase 2B of *BOOKING WARS: The Battle for the Booking Centre* is complete. A complete, deterministic, and independently testable combat and deployment engine has been implemented and integrated with the Phase 2A Core Game Engine Foundation.

The combat engine executes all combat and targeting laws specified in `FINALIZED_COMBAT_RULES.md` and `FINALIZED_GAME_RULES.md`:
- Atomic character deployment with Shift deduction, 5-slot counter limit, unique instance ID assignment, and summoning sickness.
- Front Desk Guard mandatory targeting enforcement and dynamic target updates upon Guard elimination.
- Keyword bypass and timing mechanics (`isInfiltration`, `isRush`, `isFirstResponder`).
- Simultaneous combat damage resolution with persistent Stamina retention.
- Zero-Stamina State-Based Action sweeps retiring defeated characters to the Breakroom.
- Direct Supervisor Morale attacks and match victory evaluation.
- Rule 1.4 mutual defeat resolution awarding the loss to the active turn player.
- Interactive `PendingDecision` targeting pipeline for pass-and-play and UI integration.

**Verification Results:**
- **Automated Tests:** 84 passed, 0 failed across 24 test suites.
- **Type Checking:** `npx tsc --noEmit` exited cleanly with 0 errors.
- **Production Build:** `compile_applet` succeeded.

---

## 2. Inventory of Changes

### 2.1. Files Created
1. **`src/engine/combat.ts`**: Centralized combat subsystem implementing target validation, Front Desk Guard enforcement, Infiltration bypass, Rush/First Responder timing, simultaneous damage calculations, and interactive target selection.
2. **`src/engine/tests/combat.test.ts`**: Comprehensive 20-test automated verification suite covering deployment, exhaustion, character combat, Guard priority, special keywords, mutual defeat, interactive decisions, and a full pass-and-play match.
3. **`PHASE_2B_IMPLEMENTATION_REPORT.md`**: Authoritative completion report and technical changelog.

### 2.2. Files Modified
1. **`src/engine/state.ts`**:
   - Added `isFirstResponder?: boolean` and `isInfiltration?: boolean` to `CardDefinition` and `CardInstance`.
   - Defined `CombatTarget` union (`{ type: 'CHARACTER'; characterInstanceId: string } | { type: 'MORALE'; targetPlayerId: PlayerId }`).
   - Defined `PendingCombatTargetOption` and `PendingCombatTargetDecision`.
   - Expanded `PendingDecision` union to include `PendingCombatTargetDecision`.
2. **`src/engine/actions.ts`**:
   - Added support for `DEPLOY_CARD` (synonym for `PLAY_CARD` with explicit slot support).
   - Added actions `DECLARE_ATTACK`, `INITIATE_ATTACK`, and `RESOLVE_COMBAT_TARGET`.
   - Added action error codes: `ATTACKER_NOT_READY`, `ATTACKER_CANNOT_ATTACK_MORALE`, `TARGET_PROTECTED_BY_GUARD`, `TARGET_NOT_FOUND`, `NO_PENDING_DECISION`.
   - Routed combat validation and execution through `src/engine/combat.ts`.
3. **`src/engine/turn_manager.ts`**:
   - Implemented Rule 1.4 mutual defeat in `evaluateStateBasedActions`: when both supervisors drop to $\le 0$ Morale simultaneously, the active turn player loses.
   - Updated queue resolution card instantiation to support combat keywords.
4. **`src/engine/index.ts`**:
   - Exported all combat engine types and functions from `src/engine/combat.ts`.
5. **`RULE_DECISION_LOG.md`**:
   - Logged Section 3 architectural decisions for Phase 2B combat mechanics.

---

## 3. Subsystems & Functions Implemented

| Subsystem | Function Name | Purpose & Canonical Law |
| :--- | :--- | :--- |
| **Target Calculation** | `getLegalAttackTargets(state, attackerId)` | Computes legal targets for any ready unit. Returns `canAttackMorale`, `legalCharacterTargets`, and `isRestrictedByGuard`. Enforces Guard priority, Infiltration bypass, Rush restrictions, and First Responder privileges. |
| **Attack Validation** | `validateAttack(state, attackerId, target)` | Validates active match, phase (`OPERATIONAL_ACTION`), readiness, target existence, Guard protection, and deploy-turn attack eligibility. Returns structured error codes. |
| **Simultaneous Combat** | `executeAttack(state, attackerId, target)` | Executes combat atomically. Deals simultaneous damage ($E_A$ and $E_D$ calculated before assignment). Subtracts damage from current Stamina, exhausts attacker, sweeps 0-stamina units to Breakroom, and evaluates match victory. |
| **Interactive Targeting** | `initiateAttack(state, attackerId)` | Initiates target selection modal by setting `state.pendingDecision` to `COMBAT_TARGET_SELECTION` with all allowed targets. Blocks phase advancement until resolved. |
| **Decision Resolution** | `resolveCombatTarget(state, target)` | Validates and resolves a pending combat decision, executing `executeAttack` and clearing the pending state. |
| **Character Deployment** | `executeAction(state, { type: 'DEPLOY_CARD' })` | Validates hand ownership, active player, phase, Shift cost, and 5-slot counter limit. Assigns unique instance ID, sets entered turn, and grants immediate attack readiness only if Rush or First Responder. |
| **State-Based Actions** | `evaluateStateBasedActions(state)` | Sweeps 0-stamina characters to Breakroom; checks victory conditions; applies Rule 1.4 active player loss upon simultaneous Morale depletion. |

---

## 4. Canonical Combat Rules Implemented

### 4.1. Front Desk Guard Priority
- **Law:** An attacker without `isInfiltration` cannot target enemy Morale or non-guard characters while one or more active Front Desk Guards ($\text{Stamina} > 0$) exist on the opponent's counter.
- **Verification:** Tested in `combat.test.ts` (subtests 4.1, 4.2). Direct attacks and non-guard attacks return `TARGET_PROTECTED_BY_GUARD`.
- **Dynamic Update:** When all Guards are destroyed, legal targets immediately refresh, enabling direct attacks on Morale for remaining ready attackers (subtest 4.4).

### 4.2. Infiltration Keyword
- **Law:** Characters with `isInfiltration: true` bypass defending Front Desk Guards, legally targeting non-guard units or opposing Morale directly.
- **Verification:** Tested in `combat.test.ts` (subtest 5.1). Operative deals direct Morale damage past an active 6-stamina Guard.

### 4.3. Deploy-Turn Timing (Rush vs First Responder)
- **Standard Unit:** Enters with summoning sickness (`canAttack = false`). Clears status on subsequent turn during Shift Start.
- **Rush (`isRush: true`):** Ready to attack enemy characters on the deploy turn, but strictly prohibited from attacking Morale on that turn (`ATTACKER_CANNOT_ATTACK_MORALE`).
- **First Responder (`isFirstResponder: true`):** Ready to attack characters or Morale immediately on deploy turn.
- **Verification:** Tested in `combat.test.ts` (subtests 5.2, 5.3).

### 4.4. Simultaneous Combat Damage & Persistent Durability
- **Law:** Units deal damage simultaneously equal to their current Efficiency. Damage persists across turns.
- **Verification:** Tested in `combat.test.ts` (subtest 3.1). 3/5 attacker battles 4/4 defender; both survive with 1 Stamina remaining.

### 4.5. Zero-Stamina Retirement
- **Law:** When Stamina reaches $\le 0$, the character immediately leaves the battlefield and moves to its owner's Breakroom (`zone_breakroom`). The vacated board slot is freed.
- **Verification:** Tested in `combat.test.ts` (subtests 3.2, 3.3). Lethal combat and mutual annihilation correctly move cards to respective Breakrooms.

### 4.6. Rule 1.4 Mutual Defeat
- **Law:** If both supervisors drop to 0 Morale simultaneously from a symmetrical effect, the active turn player loses.
- **Verification:** Tested in `combat.test.ts` (subtest 6.2). When P1 and P2 drop to 0 Morale simultaneously during P1's turn, `result.loser = 'p1'` and `result.winner = 'p2'`.

---

## 5. Automated Verification Results

All tests executed via Node.js native test runner:
```bash
npx tsx --test --test-reporter spec src/engine/tests/*.test.ts
```

### 5.1. Summary Breakdown
- **Phase 2A Core Engine Suite (`core_engine.test.ts`):** 11 suites, 11 tests passed.
- **Phase 2B Combat Engine Suite (`combat.test.ts`):** 9 suites, 20 tests passed.
- **Simulation Validator (`simulation_validator.test.ts`):** 5 tests passed.
- **Temporary Stamina Buffer (`stamina_buffer.test.ts`):** 1 suite, 10 tests passed.
- **Theme Decoupling Engine (`theme.test.ts`):** 1 suite, 4 tests passed.
- **Total Tests:** **84 passed, 0 failed, 0 skipped across 24 test suites.**
- **Total Execution Duration:** 981.52 ms.

### 5.2. Typecheck & Compilation
- **TypeScript Compiler:**
  ```bash
  npx tsc --noEmit
  # Exit Code: 0 (Zero errors)
  ```
- **Applet Compilation:**
  ```bash
  compile_applet
  # Build succeeded - the applet is compiled
  ```

---

## 6. Scope Boundaries & Deferred Features

In strict compliance with the Phase 2B authorization boundary:
- **Card Ability Effect Library:** Card abilities currently trigger events (`hasOnDeployAbility`) but deferred complex DSL execution (e.g. bounce, draw-on-attack, aura buffs) is assigned to Phase 2C.
- **Incident System:** Incident cards, immediate spell casting, and reactive counter-spells are deferred to Phase 2D.
- **Gear/Equipment Attachments:** Permanent weapon/armor attachments and stat modifications are deferred to Phase 2C.
- **Multiplayer & Networking:** Local pass-and-play and deterministic state serialization are supported; network synchronization is deferred.

---

## 7. Sign-Off & Readiness for Phase 2C

Phase 2B provides a robust, mathematically verified, fully testable combat engine. Two players can now conduct a complete tactical character combat match from opening hand to victory.

The engine foundation is ready for **Phase 2C (Card Ability Library & Effect DSL Integration)**.
