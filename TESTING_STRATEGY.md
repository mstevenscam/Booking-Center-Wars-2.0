# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## TESTING STRATEGY & VERIFICATION FRAMEWORK
**Version:** 1.0.0-QA  
**Authority:** Quality Assurance & Simulation Engineering  

---

### 1. TESTING PHILOSOPHY
Booking Wars requires multi-layered verification to ensure competitive fairness, deterministic rules execution, and responsive UI polish:
1. **Tier 1 (Fast-Feedback Unit Tests):** Pure Node.js unit tests (`node:test`) verifying all mathematical, rule-state, and combat logic in isolation without DOM dependencies.
2. **Tier 2 (Algorithmic Balance Simulation):** Headless match simulation bots testing card interactions, mana curves, and turn-order win rate biases across 1,000+ simulated turns.
3. **Tier 3 (Browser Automation & Visual QA):** End-to-end user journeys executed via Playwright CLI, inspecting accessibility trees, interaction flows, and the Privacy Handoff Curtain.

---

### 2. TIER 1: UNIT TESTING WITH `node:test` & `tsx`
All engine logic is tested using Node.js's native test runner executed with `npx --yes tsx --test`:

```typescript
// Sample test pattern in src/engine/tests/combat.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCombat, canAttackTarget } from '../combat';
import { createMockCharacter, createInitialGameState } from './testUtils';

test('Simultaneous combat damage reduces stamina of both characters', () => {
  const attacker = createMockCharacter({ power: 3, stamina: 4 });
  const defender = createMockCharacter({ power: 2, stamina: 3 });
  
  const result = resolveCombat(attacker, defender);
  
  assert.equal(result.attackerNewStamina, 2); // 4 - 2
  assert.equal(result.defenderNewStamina, 0); // 3 - 3 (Clocks out)
  assert.equal(result.defenderClockedOut, true);
  assert.equal(result.attackerClockedOut, false);
});

test('Front Desk Guard prevents direct attack on Supervisor', () => {
  const state = createInitialGameState();
  // Player 2 has a Front Desk Guard active
  state.players.player2.board[0] = createMockCharacter({ 
    power: 1, 
    stamina: 3, 
    hasFrontDeskGuard: true 
  });
  
  const attacker = state.players.player1.board[0];
  const isLegal = canAttackTarget(state, 'player1', attacker.instanceId, 'SUPERVISOR_PLAYER2');
  
  assert.equal(isLegal.valid, false);
  assert.match(isLegal.reason, /Front Desk Guard/);
});
```

#### Unit Test Test Suite Map:
- `src/engine/tests/shift.test.ts`: Capacity progression, refresh, temporary shift, overspending.
- `src/engine/tests/combat.test.ts`: Target legality, Front Desk Guard, simultaneous damage, persistent damage.
- `src/engine/tests/queue.test.ts`: Ticket countdowns, resolution order, disruption effects.
- `src/engine/tests/fatigue.test.ts`: Escalating Burnout damage upon drawing from empty deck.
- `src/engine/tests/win_loss.test.ts`: Morale zero triggers, instant win detection, tiebreakers.

---

### 3. TIER 2: HEADLESS BALANCE SIMULATOR
To identify broken combos and statistical anomalies before player release:
- **Headless Bot Loop:** A lightweight runner executes games between heuristic AI bots (Aggro Bot, Control Bot, Midrange Bot).
- **Tracked Metrics:**
  - Player 1 (First Move) vs. Player 2 (The Master Key) win rate (Target: 50% ± 3%).
  - Average game length in turns (Target: 7 - 10 turns).
  - Individual card play rate and win-when-played delta.
  - Frequency of games ending via Morale reduction vs. Burnout fatigue.

---

### 4. TIER 3: BATTLEFIELD UI & BROWSER JOURNEYS
Using Playwright CLI, automated scripts verify:
1. **Pass-and-Play Handoff Journey:**
   - Player 1 deploys card -> Attacks -> Clicks "End Shift".
   - Privacy Handoff Curtain renders instantly, obscuring Player 1 hand.
   - Player 2 clicks "Clock In" -> Curtain slides away -> Player 2 hand revealed.
2. **Interactive Drag-and-Drop:**
   - Card dragging triggers smooth hover scale and draws valid targeting line.
   - Dropping card on occupied/illegal slot snaps back safely to hand.
3. **Card Workshop Workflow:**
   - Dropping test front/back image displays preview.
   - AI proposal fields populate correctly without overwriting raw image archives.
