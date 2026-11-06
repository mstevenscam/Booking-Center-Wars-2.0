/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Phase 2B: Combat Engine Automated Verification Test Suite
 * 
 * Verifies all canonical combat laws from FINALIZED_COMBAT_RULES.md and FINALIZED_GAME_RULES.md:
 * 1. Character Deployment, Shift Deductions & Zone Transitions
 * 2. Attack Eligibility, Exhaustion & Double-Attack Prevention
 * 3. Character-vs-Character Simultaneous Combat & Persistent Damage
 * 4. Front Desk Guard Priority Enforcement & Multiple Guards
 * 5. Guard Removal & Dynamic Legal Target Updating
 * 6. Infiltration Bypass Mechanics
 * 7. Rush vs First Responder Deploy-Turn Restrictions
 * 8. Direct Morale Attacks, Damage Application & Victory Detection
 * 9. Rule 1.4 Mutual Defeat Resolution (Active player loses)
 * 10. State-Based Action Sweep & Zero-Stamina Breakroom Retirement
 * 11. Interactive Combat Target Pending Decisions & Serialization
 * 12. Full Multi-Turn 2-Player Pass-and-Play Combat Match
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createInitialGameState,
  instantiateCard,
  CardDefinition,
  CardInstance,
  GameState,
  serializeGameState,
  deserializeGameState
} from '../state.js';
import {
  advanceToNextPhase,
  executeShiftStart,
  executeShiftBudgeting,
  executeClockOut,
  evaluateStateBasedActions
} from '../turn_manager.js';
import {
  executeAction,
  validateAction
} from '../actions.js';
import {
  getLegalAttackTargets,
  validateAttack,
  executeAttack,
  initiateAttack,
  resolveCombatTarget
} from '../combat.js';

function createTestDeck(prefix: string): CardDefinition[] {
  const cards: CardDefinition[] = [];
  for (let i = 0; i < 15; i++) {
    cards.push({
      id: `${prefix}_card_${i}_a`,
      name: `Test Unit ${i}`,
      cardType: 'CHARACTER',
      baseCost: (i % 5) + 1,
      influence: 2,
      efficiency: 2 + (i % 3),
      stamina: 3 + (i % 4),
      isFrontDeskGuard: false,
      isRush: false
    });
    cards.push({
      id: `${prefix}_card_${i}_b`,
      name: `Test Unit ${i} B`,
      cardType: 'CHARACTER',
      baseCost: (i % 5) + 1,
      influence: 2,
      efficiency: 2 + (i % 3),
      stamina: 3 + (i % 4),
      isFrontDeskGuard: false,
      isRush: false
    });
  }
  return cards;
}

function createReadyMatch(): GameState {
  const p1Deck = createTestDeck('p1');
  const p2Deck = createTestDeck('p2');
  const state = createInitialGameState({ p1Deck, p2Deck, config: 'CONFIG_D' });
  // Advance from SHIFT_START to OPERATIONAL_ACTION (one call traverses automated phases 1-3)
  advanceToNextPhase(state);
  return state;
}

describe('Phase 2B: Combat Engine Verification', () => {

  describe('1. Character Deployment & Resource Integrity', () => {
    it('deploys character from hand with exact Shift deduction and summoning sickness', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      p1.currentShift = 5;
      
      const cardToDeploy = p1.hand[0];
      cardToDeploy.currentCost = 3;
      cardToDeploy.isRush = false;
      cardToDeploy.isFirstResponder = false;

      const result = executeAction(state, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: cardToDeploy.instanceId
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(p1.currentShift, 2, 'Shift deducted exactly once');
      assert.strictEqual(p1.battlefield.length, 1);
      assert.strictEqual(p1.battlefield[0].card.instanceId, cardToDeploy.instanceId);
      assert.strictEqual(p1.battlefield[0].canAttack, false, 'Standard character has summoning sickness');
      assert.strictEqual(p1.battlefield[0].enteredTurn, state.currentTurn);
      assert.strictEqual(p1.hand.some(c => c.instanceId === cardToDeploy.instanceId), false);
    });

    it('rejects deployment when Shift is insufficient', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      p1.currentShift = 1;
      p1.hand[0].currentCost = 4;

      const result = executeAction(state, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: p1.hand[0].instanceId
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'INSUFFICIENT_SHIFT');
      assert.strictEqual(p1.battlefield.length, 0);
    });

    it('rejects deployment when battlefield is at maximum capacity (5/5)', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      p1.currentShift = 10;

      // Fill 5 slots
      for (let i = 0; i < 5; i++) {
        p1.battlefield.push({
          slotId: `slot_${i}`,
          card: instantiateCard({
            id: `board_unit_${i}`,
            name: `Unit ${i}`,
            cardType: 'CHARACTER',
            baseCost: 2,
            influence: 2,
            efficiency: 2,
            stamina: 3
          }, 'p1', 'BATTLEFIELD'),
          canAttack: false,
          enteredTurn: state.currentTurn
        });
      }

      const result = executeAction(state, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: p1.hand[0].instanceId
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'BATTLEFIELD_FULL');
    });

    it('rejects deployment during unauthorized phases', () => {
      const state = createReadyMatch();
      state.currentPhase = 'SHIFT_START';

      const result = executeAction(state, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: state.players.p1.hand[0].instanceId
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'INVALID_PHASE');
    });
  });

  describe('2. Attack Eligibility, Exhaustion & Double-Attack Prevention', () => {
    it('exhausts attacker upon attack declaration and rejects second attack', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      const p2 = state.players.p2;

      const attackerCard = instantiateCard({
        id: 'vet_striker',
        name: 'Veteran Striker',
        cardType: 'CHARACTER',
        baseCost: 3,
        influence: 2,
        efficiency: 4,
        stamina: 5
      }, 'p1', 'BATTLEFIELD');

      p1.battlefield.push({
        slotId: 'slot_0',
        card: attackerCard,
        canAttack: true, // Ready
        enteredTurn: 0   // Deployed prior turn
      });

      // Declare attack against P2 Morale
      const result1 = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attackerCard.instanceId,
        target: { type: 'MORALE', targetPlayerId: 'p2' }
      });

      assert.strictEqual(result1.success, true);
      assert.strictEqual(p2.morale, 26, 'P2 took 4 Morale damage');
      assert.strictEqual(p1.battlefield[0].canAttack, false, 'Attacker is now exhausted');

      // Attempt second attack with the same character on the same turn
      const result2 = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attackerCard.instanceId,
        target: { type: 'MORALE', targetPlayerId: 'p2' }
      });

      assert.strictEqual(result2.success, false);
      assert.strictEqual(result2.code, 'ATTACKER_NOT_READY');
      assert.strictEqual(p2.morale, 26, 'Morale unchanged on illegal attack');
    });

    it('rejects attacks by summoning sick characters (non-Rush on deploy turn)', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;

      const freshCard = instantiateCard({
        id: 'new_intern',
        name: 'New Intern',
        cardType: 'CHARACTER',
        baseCost: 1,
        influence: 1,
        efficiency: 2,
        stamina: 2
      }, 'p1', 'BATTLEFIELD');

      p1.battlefield.push({
        slotId: 'slot_0',
        card: freshCard,
        canAttack: false, // Summoning sickness
        enteredTurn: state.currentTurn
      });

      const result = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: freshCard.instanceId,
        target: { type: 'MORALE', targetPlayerId: 'p2' }
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'ATTACKER_NOT_READY');
    });
  });

  describe('3. Character-versus-Character Combat & Simultaneous Damage', () => {
    it('calculates and applies simultaneous combat damage accurately', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      const p2 = state.players.p2;

      // Attacker: 3 Efficiency, 5 Stamina
      const attacker = instantiateCard({
        id: 'unit_attacker',
        name: 'Lead Technician',
        cardType: 'CHARACTER',
        baseCost: 3,
        influence: 2,
        efficiency: 3,
        stamina: 5
      }, 'p1', 'BATTLEFIELD');
      p1.battlefield.push({ slotId: 'slot_0', card: attacker, canAttack: true, enteredTurn: 0 });

      // Defender: 4 Efficiency, 4 Stamina
      const defender = instantiateCard({
        id: 'unit_defender',
        name: 'Shift Supervisor',
        cardType: 'CHARACTER',
        baseCost: 4,
        influence: 3,
        efficiency: 4,
        stamina: 4
      }, 'p2', 'BATTLEFIELD');
      p2.battlefield.push({ slotId: 'slot_0', card: defender, canAttack: true, enteredTurn: 0 });

      const result = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attacker.instanceId,
        target: { type: 'CHARACTER', characterInstanceId: defender.instanceId }
      });

      assert.strictEqual(result.success, true);
      // Attacker dealt 3 damage to Defender (4 - 3 = 1 Stamina remaining)
      // Defender dealt 4 counter damage to Attacker (5 - 4 = 1 Stamina remaining)
      assert.strictEqual(p1.battlefield[0].card.stamina, 1, 'Attacker took 4 counter damage, survives with 1');
      assert.strictEqual(p2.battlefield[0].card.stamina, 1, 'Defender took 3 damage, survives with 1');
      assert.strictEqual(p1.battlefield[0].canAttack, false, 'Attacker is exhausted');
    });

    it('retires unit to Breakroom when Stamina reaches 0 and clears board slot', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      const p2 = state.players.p2;

      // Attacker: 5 Efficiency, 5 Stamina
      const attacker = instantiateCard({
        id: 'big_striker',
        name: 'Heavy Striker',
        cardType: 'CHARACTER',
        baseCost: 5,
        influence: 2,
        efficiency: 5,
        stamina: 5
      }, 'p1', 'BATTLEFIELD');
      p1.battlefield.push({ slotId: 'slot_0', card: attacker, canAttack: true, enteredTurn: 0 });

      // Defender: 2 Efficiency, 3 Stamina (will die from 5 damage)
      const defender = instantiateCard({
        id: 'small_guard',
        name: 'Assistant',
        cardType: 'CHARACTER',
        baseCost: 2,
        influence: 1,
        efficiency: 2,
        stamina: 3
      }, 'p2', 'BATTLEFIELD');
      p2.battlefield.push({ slotId: 'slot_0', card: defender, canAttack: true, enteredTurn: 0 });

      const result = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attacker.instanceId,
        target: { type: 'CHARACTER', characterInstanceId: defender.instanceId }
      });

      assert.strictEqual(result.success, true);
      // Attacker survives: took 2 damage -> 3 stamina remaining
      assert.strictEqual(p1.battlefield.length, 1);
      assert.strictEqual(p1.battlefield[0].card.stamina, 3);

      // Defender dies: took 5 damage -> 0 stamina -> sent to P2 Breakroom
      assert.strictEqual(p2.battlefield.length, 0, 'Defender board slot vacated');
      assert.strictEqual(p2.breakroom.length, 1, 'Defender moved to Breakroom');
      assert.strictEqual(p2.breakroom[0].instanceId, defender.instanceId);
      assert.strictEqual(p2.breakroom[0].currentZone, 'BREAKROOM');
    });

    it('simultaneously retires both characters when mutual lethal damage occurs', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      const p2 = state.players.p2;

      // Attacker: 4 Efficiency, 3 Stamina
      const attacker = instantiateCard({
        id: 'glass_cannon_p1',
        name: 'Glass Cannon 1',
        cardType: 'CHARACTER',
        baseCost: 3,
        influence: 1,
        efficiency: 4,
        stamina: 3
      }, 'p1', 'BATTLEFIELD');
      p1.battlefield.push({ slotId: 'slot_0', card: attacker, canAttack: true, enteredTurn: 0 });

      // Defender: 4 Efficiency, 3 Stamina
      const defender = instantiateCard({
        id: 'glass_cannon_p2',
        name: 'Glass Cannon 2',
        cardType: 'CHARACTER',
        baseCost: 3,
        influence: 1,
        efficiency: 4,
        stamina: 3
      }, 'p2', 'BATTLEFIELD');
      p2.battlefield.push({ slotId: 'slot_0', card: defender, canAttack: true, enteredTurn: 0 });

      const result = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attacker.instanceId,
        target: { type: 'CHARACTER', characterInstanceId: defender.instanceId }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(p1.battlefield.length, 0, 'Attacker clocked out');
      assert.strictEqual(p2.battlefield.length, 0, 'Defender clocked out');
      assert.strictEqual(p1.breakroom.length, 1, 'Attacker in P1 Breakroom');
      assert.strictEqual(p2.breakroom.length, 1, 'Defender in P2 Breakroom');
    });
  });

  describe('4. Front Desk Guard Priority & Targeting Enforcement', () => {
    it('prohibits direct attacks to Morale when opponent controls Front Desk Guard', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      const p2 = state.players.p2;

      const attacker = instantiateCard({
        id: 'attacker_p1',
        name: 'Attacker',
        cardType: 'CHARACTER',
        baseCost: 2,
        influence: 1,
        efficiency: 3,
        stamina: 4
      }, 'p1', 'BATTLEFIELD');
      p1.battlefield.push({ slotId: 'slot_0', card: attacker, canAttack: true, enteredTurn: 0 });

      const guard = instantiateCard({
        id: 'front_desk_guard',
        name: 'Front Desk Sentry',
        cardType: 'CHARACTER',
        baseCost: 3,
        influence: 2,
        efficiency: 1,
        stamina: 5,
        isFrontDeskGuard: true
      }, 'p2', 'BATTLEFIELD');
      p2.battlefield.push({ slotId: 'slot_0', card: guard, canAttack: false, enteredTurn: 0 });

      // Attempt direct attack on Morale
      const result = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attacker.instanceId,
        target: { type: 'MORALE', targetPlayerId: 'p2' }
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'TARGET_PROTECTED_BY_GUARD');
      assert.strictEqual(p2.morale, 30, 'Morale protected by Guard');
    });

    it('prohibits attacks to non-guard characters when Front Desk Guard is present', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      const p2 = state.players.p2;

      const attacker = instantiateCard({
        id: 'attacker_p1',
        name: 'Attacker',
        cardType: 'CHARACTER',
        baseCost: 2,
        influence: 1,
        efficiency: 3,
        stamina: 4
      }, 'p1', 'BATTLEFIELD');
      p1.battlefield.push({ slotId: 'slot_0', card: attacker, canAttack: true, enteredTurn: 0 });

      const guard = instantiateCard({
        id: 'guard_unit',
        name: 'Active Guard',
        cardType: 'CHARACTER',
        baseCost: 3,
        influence: 2,
        efficiency: 1,
        stamina: 5,
        isFrontDeskGuard: true
      }, 'p2', 'BATTLEFIELD');

      const nonGuard = instantiateCard({
        id: 'vulnerable_unit',
        name: 'VIP Coordinator',
        cardType: 'CHARACTER',
        baseCost: 4,
        influence: 3,
        efficiency: 4,
        stamina: 2,
        isFrontDeskGuard: false
      }, 'p2', 'BATTLEFIELD');

      p2.battlefield.push({ slotId: 'slot_0', card: guard, canAttack: false, enteredTurn: 0 });
      p2.battlefield.push({ slotId: 'slot_1', card: nonGuard, canAttack: false, enteredTurn: 0 });

      // Attempt to attack non-guard VIP
      const result = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attacker.instanceId,
        target: { type: 'CHARACTER', characterInstanceId: nonGuard.instanceId }
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'TARGET_PROTECTED_BY_GUARD');
    });

    it('permits attacking either Guard when multiple Front Desk Guards are present', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      const p2 = state.players.p2;

      const attacker = instantiateCard({
        id: 'attacker_p1',
        name: 'Attacker',
        cardType: 'CHARACTER',
        baseCost: 2,
        influence: 1,
        efficiency: 2,
        stamina: 4
      }, 'p1', 'BATTLEFIELD');
      p1.battlefield.push({ slotId: 'slot_0', card: attacker, canAttack: true, enteredTurn: 0 });

      const guard1 = instantiateCard({
        id: 'guard_1',
        name: 'Guard 1',
        cardType: 'CHARACTER',
        baseCost: 2,
        influence: 1,
        efficiency: 1,
        stamina: 3,
        isFrontDeskGuard: true
      }, 'p2', 'BATTLEFIELD');

      const guard2 = instantiateCard({
        id: 'guard_2',
        name: 'Guard 2',
        cardType: 'CHARACTER',
        baseCost: 2,
        influence: 1,
        efficiency: 1,
        stamina: 4,
        isFrontDeskGuard: true
      }, 'p2', 'BATTLEFIELD');

      p2.battlefield.push({ slotId: 'slot_0', card: guard1, canAttack: false, enteredTurn: 0 });
      p2.battlefield.push({ slotId: 'slot_1', card: guard2, canAttack: false, enteredTurn: 0 });

      const legal = getLegalAttackTargets(state, attacker.instanceId);
      assert.notStrictEqual(legal, null);
      assert.strictEqual(legal!.canAttackMorale, false);
      assert.strictEqual(legal!.legalCharacterTargets.length, 2);

      // Player attacks Guard 2
      const result = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attacker.instanceId,
        target: { type: 'CHARACTER', characterInstanceId: guard2.instanceId }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(guard2.stamina, 2, 'Guard 2 took 2 damage');
    });

    it('immediately updates legal targets to include Morale and non-guards upon Guard retirement', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      const p2 = state.players.p2;

      // Two attackers on P1
      const attacker1 = instantiateCard({ id: 'att_1', name: 'Att 1', cardType: 'CHARACTER', baseCost: 3, influence: 1, efficiency: 4, stamina: 4 }, 'p1', 'BATTLEFIELD');
      const attacker2 = instantiateCard({ id: 'att_2', name: 'Att 2', cardType: 'CHARACTER', baseCost: 3, influence: 1, efficiency: 3, stamina: 4 }, 'p1', 'BATTLEFIELD');
      p1.battlefield.push({ slotId: 'slot_0', card: attacker1, canAttack: true, enteredTurn: 0 });
      p1.battlefield.push({ slotId: 'slot_1', card: attacker2, canAttack: true, enteredTurn: 0 });

      // Guard (3 stamina, 1 eff) on P2
      const guard = instantiateCard({ id: 'guard_unit', name: 'Guard', cardType: 'CHARACTER', baseCost: 2, influence: 1, efficiency: 1, stamina: 3, isFrontDeskGuard: true }, 'p2', 'BATTLEFIELD');
      p2.battlefield.push({ slotId: 'slot_0', card: guard, canAttack: false, enteredTurn: 0 });

      // Attacker 1 destroys Guard (4 eff vs 3 sta)
      const res1 = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attacker1.instanceId,
        target: { type: 'CHARACTER', characterInstanceId: guard.instanceId }
      });
      assert.strictEqual(res1.success, true);
      assert.strictEqual(p2.battlefield.length, 0, 'Guard clocked out to Breakroom');

      // Now query legal targets for Attacker 2: Morale is now wide open!
      const legal = getLegalAttackTargets(state, attacker2.instanceId);
      assert.notStrictEqual(legal, null);
      assert.strictEqual(legal!.canAttackMorale, true, 'Morale is now targetable');
      assert.strictEqual(legal!.isRestrictedByGuard, false);

      // Attacker 2 hits Morale directly
      const res2 = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attacker2.instanceId,
        target: { type: 'MORALE', targetPlayerId: 'p2' }
      });
      assert.strictEqual(res2.success, true);
      assert.strictEqual(p2.morale, 27, 'Morale took 3 damage directly');
    });
  });

  describe('5. Special Combat Keywords: Infiltration, Rush, First Responder', () => {
    it('Infiltration keyword bypasses Front Desk Guard to hit Morale or non-guards', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      const p2 = state.players.p2;

      const stealthAttacker = instantiateCard({
        id: 'stealth_operative',
        name: 'Audit Infiltrator',
        cardType: 'CHARACTER',
        baseCost: 4,
        influence: 2,
        efficiency: 3,
        stamina: 3,
        isInfiltration: true
      }, 'p1', 'BATTLEFIELD');
      p1.battlefield.push({ slotId: 'slot_0', card: stealthAttacker, canAttack: true, enteredTurn: 0 });

      const guard = instantiateCard({
        id: 'heavy_guard',
        name: 'Heavy Guard',
        cardType: 'CHARACTER',
        baseCost: 4,
        influence: 3,
        efficiency: 2,
        stamina: 6,
        isFrontDeskGuard: true
      }, 'p2', 'BATTLEFIELD');
      p2.battlefield.push({ slotId: 'slot_0', card: guard, canAttack: false, enteredTurn: 0 });

      const legal = getLegalAttackTargets(state, stealthAttacker.instanceId);
      assert.notStrictEqual(legal, null);
      assert.strictEqual(legal!.canAttackMorale, true, 'Infiltration bypasses guard');

      const result = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: stealthAttacker.instanceId,
        target: { type: 'MORALE', targetPlayerId: 'p2' }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(p2.morale, 27, 'Infiltrator hit Morale directly past the Guard');
    });

    it('Rush keyword allows attacking enemy characters on deploy turn, but NOT Morale', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      const p2 = state.players.p2;

      // Deploy enemy target
      const enemyTarget = instantiateCard({
        id: 'enemy_target',
        name: 'Enemy Target',
        cardType: 'CHARACTER',
        baseCost: 2,
        influence: 1,
        efficiency: 1,
        stamina: 4
      }, 'p2', 'BATTLEFIELD');
      p2.battlefield.push({ slotId: 'slot_0', card: enemyTarget, canAttack: false, enteredTurn: 0 });

      // Rush unit deployed on turn 1
      const rushUnit = instantiateCard({
        id: 'rush_runner',
        name: 'Express Courier',
        cardType: 'CHARACTER',
        baseCost: 3,
        influence: 1,
        efficiency: 3,
        stamina: 2,
        isRush: true
      }, 'p1', 'HAND');
      p1.hand.push(rushUnit);
      p1.currentShift = 5;

      const deployRes = executeAction(state, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: rushUnit.instanceId
      });
      assert.strictEqual(deployRes.success, true);
      assert.strictEqual(p1.battlefield[0].canAttack, true, 'Rush unit is ready to attack characters');

      // Attempt to attack Morale on deploy turn -> Must be rejected!
      const moraleAttackRes = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: rushUnit.instanceId,
        target: { type: 'MORALE', targetPlayerId: 'p2' }
      });
      assert.strictEqual(moraleAttackRes.success, false);
      assert.strictEqual(moraleAttackRes.code, 'ATTACKER_CANNOT_ATTACK_MORALE');

      // Attack enemy character -> Must succeed!
      const charAttackRes = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: rushUnit.instanceId,
        target: { type: 'CHARACTER', characterInstanceId: enemyTarget.instanceId }
      });
      assert.strictEqual(charAttackRes.success, true);
      assert.strictEqual(enemyTarget.stamina, 1, 'Enemy took 3 damage from Rush attacker');
    });

    it('First Responder keyword allows attacking Morale immediately on deploy turn', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;

      const firstResponder = instantiateCard({
        id: 'first_responder_unit',
        name: 'Emergency Lead',
        cardType: 'CHARACTER',
        baseCost: 4,
        influence: 2,
        efficiency: 4,
        stamina: 3,
        isFirstResponder: true
      }, 'p1', 'HAND');
      p1.hand.push(firstResponder);
      p1.currentShift = 6;

      const deployRes = executeAction(state, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: firstResponder.instanceId
      });
      assert.strictEqual(deployRes.success, true);

      // Attack Morale immediately on deploy turn
      const attackRes = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: firstResponder.instanceId,
        target: { type: 'MORALE', targetPlayerId: 'p2' }
      });
      assert.strictEqual(attackRes.success, true);
      assert.strictEqual(state.players.p2.morale, 26, 'First Responder hit Morale on deploy turn');
    });
  });

  describe('6. Morale Depletion, Victory Detection & Rule 1.4 Mutual Defeat', () => {
    it('detects match completion immediately when opponent Morale reaches 0', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      const p2 = state.players.p2;
      p2.morale = 3;

      const attacker = instantiateCard({
        id: 'finisher',
        name: 'Finisher',
        cardType: 'CHARACTER',
        baseCost: 3,
        influence: 2,
        efficiency: 4,
        stamina: 4
      }, 'p1', 'BATTLEFIELD');
      p1.battlefield.push({ slotId: 'slot_0', card: attacker, canAttack: true, enteredTurn: 0 });

      const res = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attacker.instanceId,
        target: { type: 'MORALE', targetPlayerId: 'p2' }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(p2.morale, 0);
      assert.strictEqual(state.status, 'COMPLETED');
      assert.strictEqual(state.result?.winner, 'p1');
      assert.strictEqual(state.result?.loser, 'p2');

      // Attempting any subsequent action is rejected
      const illegalAction = executeAction(state, {
        type: 'END_PHASE',
        playerId: 'p1'
      });
      assert.strictEqual(illegalAction.success, false);
      assert.strictEqual(illegalAction.code, 'MATCH_NOT_ACTIVE');
    });

    it('enforces Rule 1.4: Active turn player loses when mutual defeat occurs', () => {
      const state = createReadyMatch();
      state.activePlayerId = 'p1';
      state.players.p1.morale = 0;
      state.players.p2.morale = 0;

      evaluateStateBasedActions(state);

      assert.strictEqual(state.status, 'COMPLETED');
      assert.strictEqual(state.result?.loser, 'p1', 'Active turn player (P1) is designated the loser');
      assert.strictEqual(state.result?.winner, 'p2', 'Non-active player (P2) is awarded the win');
      assert.match(state.result?.winReason || '', /Rule 1\.4/);
    });
  });

  describe('7. Interactive Combat Target Pending Decisions & Serialization', () => {
    it('creates PendingCombatTargetDecision, validates targets, and resolves cleanly', () => {
      const state = createReadyMatch();
      const p1 = state.players.p1;
      const p2 = state.players.p2;

      const attacker = instantiateCard({
        id: 'tactician',
        name: 'Field Tactician',
        cardType: 'CHARACTER',
        baseCost: 3,
        influence: 2,
        efficiency: 3,
        stamina: 4
      }, 'p1', 'BATTLEFIELD');
      p1.battlefield.push({ slotId: 'slot_0', card: attacker, canAttack: true, enteredTurn: 0 });

      const guard = instantiateCard({
        id: 'guard_unit',
        name: 'Desk Guard',
        cardType: 'CHARACTER',
        baseCost: 2,
        influence: 1,
        efficiency: 1,
        stamina: 3,
        isFrontDeskGuard: true
      }, 'p2', 'BATTLEFIELD');
      p2.battlefield.push({ slotId: 'slot_0', card: guard, canAttack: false, enteredTurn: 0 });

      // Initiate interactive target selection
      const initRes = executeAction(state, {
        type: 'INITIATE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attacker.instanceId
      });
      assert.strictEqual(initRes.success, true);
      assert.notStrictEqual(state.pendingDecision, null);
      assert.strictEqual(state.pendingDecision?.type, 'COMBAT_TARGET_SELECTION');

      if (state.pendingDecision?.type === 'COMBAT_TARGET_SELECTION') {
        assert.strictEqual(state.pendingDecision.attackerInstanceId, attacker.instanceId);
        // Because a Guard exists, only the Guard should be in allowedTargets
        assert.strictEqual(state.pendingDecision.allowedTargets.length, 1);
        assert.strictEqual(state.pendingDecision.allowedTargets[0].isGuard, true);
      }

      // Check serialization round-trip while COMBAT_TARGET_SELECTION is active
      const serialized = serializeGameState(state);
      const deserialized = deserializeGameState(serialized);
      assert.strictEqual(deserialized.pendingDecision?.type, 'COMBAT_TARGET_SELECTION');
      assert.deepStrictEqual(deserialized, state, 'State preserves pending combat decision across JSON');

      // Attempting illegal move while decision pending is rejected
      const illegalMove = executeAction(state, {
        type: 'END_PHASE',
        playerId: 'p1'
      });
      assert.strictEqual(illegalMove.success, false);
      assert.strictEqual(illegalMove.code, 'PENDING_DECISION_REQUIRED');

      // Resolve combat decision with valid target
      const resolveRes = executeAction(state, {
        type: 'RESOLVE_COMBAT_TARGET',
        playerId: 'p1',
        target: { type: 'CHARACTER', characterInstanceId: guard.instanceId }
      });

      assert.strictEqual(resolveRes.success, true);
      assert.strictEqual(state.pendingDecision, null, 'Pending decision cleared');
      assert.strictEqual(p2.battlefield.length, 0, 'Guard clocked out from 3 damage');
    });
  });

  describe('8. Complete 2-Player Pass-and-Play Combat Match', () => {
    it('executes a complete multi-turn combat encounter from opening to victory', () => {
      const state = createReadyMatch();

      // P1 deploys unit on Turn 1 (Phase 4)
      const p1Unit = state.players.p1.hand[0];
      p1Unit.currentCost = 1;
      p1Unit.efficiency = 5;
      p1Unit.stamina = 5;
      executeAction(state, { type: 'DEPLOY_CARD', playerId: 'p1', cardInstanceId: p1Unit.instanceId });

      // P1 ends turn
      executeAction(state, { type: 'END_PHASE', playerId: 'p1' });

      // P2 Turn (Round 1, Player 2)
      assert.strictEqual(state.currentTurn, 1);
      assert.strictEqual(state.activePlayerId, 'p2');
      assert.strictEqual(state.currentPhase, 'SHIFT_START');
      advanceToNextPhase(state); // Advances through maintenance to OPERATIONAL_ACTION
      assert.strictEqual(state.currentPhase, 'OPERATIONAL_ACTION');

      // P2 passes turn
      executeAction(state, { type: 'END_PHASE', playerId: 'p2' });

      // Round 2, Player 1: P1 unit is now Ready!
      assert.strictEqual(state.currentTurn, 2);
      assert.strictEqual(state.activePlayerId, 'p1');
      advanceToNextPhase(state); // Readies battlefield units and advances to OPERATIONAL_ACTION
      assert.strictEqual(state.currentPhase, 'OPERATIONAL_ACTION');
      assert.strictEqual(state.players.p1.battlefield[0].canAttack, true, 'Unit readied on turn start');

      // P1 attacks P2 Morale: 30 - 5 = 25
      executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: p1Unit.instanceId,
        target: { type: 'MORALE', targetPlayerId: 'p2' }
      });
      assert.strictEqual(state.players.p2.morale, 25);

      // Fast-forward P2 Morale to 4
      state.players.p2.morale = 4;

      // P1 ends turn, P2 passes turn, P1 takes Round 3
      executeAction(state, { type: 'END_PHASE', playerId: 'p1' });
      advanceToNextPhase(state); // P2 to OPERATIONAL_ACTION
      executeAction(state, { type: 'END_PHASE', playerId: 'p2' });
      advanceToNextPhase(state); // P1 to OPERATIONAL_ACTION, unit readied

      assert.strictEqual(state.currentTurn, 3);
      assert.strictEqual(state.activePlayerId, 'p1');

      // Lethal strike to Morale
      const lethalRes = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: p1Unit.instanceId,
        target: { type: 'MORALE', targetPlayerId: 'p2' }
      });

      assert.strictEqual(lethalRes.success, true);
      assert.strictEqual(state.players.p2.morale, 0);
      assert.strictEqual(state.status, 'COMPLETED');
      assert.strictEqual(state.result?.winner, 'p1');
    });
  });
});
