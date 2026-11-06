/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Phase 2C-A Critical Integration Defect Remediation Test Suite
 * 
 * Verifies strict correctness for:
 * 1. Defect 1 — Duplicate START_OF_SHIFT & END_OF_SHIFT execution
 * 2. Defect 2 — Incomplete pending-decision suspension and resumption across parent operations:
 *    - 2A: ON_PLAY followed by ON_DEPLOY suspension/resumption
 *    - 2B: ON_ATTACK pauses combat before damage calculation
 *    - 2C: END_OF_SHIFT pauses before buff expiration, shift clearing, player advance
 *    - 2D: Multiple independent triggers preserve decisions in sequential FIFO queue
 * 3. Defect 3 — Execution budget exhaustion preserves remaining candidates in pendingTriggerQueue
 * 4. Defect 4 — Centralized ON_CLOCK_OUT snapshot validation and teammate isolation
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GameState,
  PlayerId,
  CardInstance,
  AbilityDefinition,
  ExecutionContext,
  serializeGameState,
  deserializeGameState,
  cloneGameState,
  executeShiftStart,
  executeClockOut,
  advanceToNextPhase,
  evaluateStateBasedActions,
  completeShiftStartAfterTriggers,
  completeClockOutCleanup,
  executeAttack,
  completeSuspendedCombat,
  executeAction,
  dispatchTriggers,
  resolveAbilityEffect,
  CANONICAL_ABILITY_CATALOG,
  MAX_EXECUTION_BUDGET
} from '../index.js';

function createTestCard(id: string, owner: PlayerId, abilities: AbilityDefinition[] = []): CardInstance {
  return {
    instanceId: id,
    cardDefId: `def_${id}`,
    ownerId: owner,
    currentZone: 'BATTLEFIELD',
    baseCost: 2,
    currentCost: 2,
    canQueueDiscount: true,
    isReroutedFromQueue: false,
    influence: 1,
    efficiency: 2,
    stamina: 3,
    maxStamina: 3,
    temporaryStaminaBuffer: 0,
    hasOnDeployAbility: abilities.some(a => a.trigger === 'ON_DEPLOY'),
    isFrontDeskGuard: false,
    isRush: false,
    isFirstResponder: false,
    isInfiltration: false,
    abilities,
    hasTriggeredClockOut: false,
    baseTemplate: {
      baseCost: 2,
      efficiency: 2,
      stamina: 3,
      influence: 1,
      abilities: [...abilities],
      isFrontDeskGuard: false,
      isRush: false,
      isFirstResponder: false,
      isInfiltration: false,
      hasOnDeployAbility: abilities.some(a => a.trigger === 'ON_DEPLOY')
    }
  };
}

function createMinimalState(): GameState {
  return {
    matchId: 'test_match_remediation',
    status: 'ACTIVE',
    config: 'CONFIG_D',
    currentTurn: 1,
    activePlayerId: 'p1',
    currentPhase: 'OPERATIONAL_ACTION',
    players: {
      p1: {
        id: 'p1',
        morale: 20, // Start below max 30 so HEAL_MORALE can be tested cleanly
        maxMorale: 30,
        baseShiftCapacity: 5,
        currentShift: 5,
        temporaryShift: 0,
        pendingEscrowRefund: 0,
        masterKeyCount: 0,
        fatigueCount: 0,
        deck: [],
        hand: [],
        battlefield: [],
        breakroom: [],
        queue: [],
        ticketCounter: 0
      },
      p2: {
        id: 'p2',
        morale: 30,
        maxMorale: 30,
        baseShiftCapacity: 5,
        currentShift: 5,
        temporaryShift: 0,
        pendingEscrowRefund: 0,
        masterKeyCount: 1,
        fatigueCount: 0,
        deck: [],
        hand: [],
        battlefield: [],
        breakroom: [],
        queue: [],
        ticketCounter: 0
      }
    },
    pendingDecision: null,
    pendingTriggerQueue: [],
    pendingContinuation: null,
    instanceCounter: 0,
    result: null,
    historyLog: []
  };
}

describe('Phase 2C-A Integration Defect Remediation Test Suite', () => {

  // =========================================================================
  // DEFECT 1: Duplicate START_OF_SHIFT & END_OF_SHIFT Execution
  // =========================================================================
  describe('1. Defect 1 — Exact Single Execution for Phase-Wide Triggers', () => {
    test('START_OF_SHIFT executes exactly 1 time with 1 eligible unit', () => {
      const state = createMinimalState();
      state.currentPhase = 'SHIFT_START';

      const startAbility: AbilityDefinition = {
        abilityId: 'AB_START_1',
        name: 'Morning Briefing',
        trigger: 'START_OF_SHIFT',
        targetFilter: 'FRIENDLY_SUPERVISOR',
        effectType: 'HEAL_MORALE',
        primaryValue: 1,
        customDescription: 'Restore 1 morale'
      };

      const card = createTestCard('p1_c1', 'p1', [startAbility]);
      state.players.p1.battlefield.push({
        slotId: 'slot_0',
        card,
        canAttack: false,
        enteredTurn: 1
      });

      const initialMorale = state.players.p1.morale;
      executeShiftStart(state);

      // Card has 1 ability: restored friendly supervisor by 1 morale exactly once (20 -> 21)
      assert.equal(state.players.p1.morale, initialMorale + 1);
    });

    test('START_OF_SHIFT executes exactly 2 times (1 per unit) with 2 eligible units, not 4', () => {
      const state = createMinimalState();
      state.currentPhase = 'SHIFT_START';

      const startAbility: AbilityDefinition = {
        abilityId: 'AB_START_BUFF',
        name: 'Shift Handshake',
        trigger: 'START_OF_SHIFT',
        targetFilter: 'FRIENDLY_SUPERVISOR',
        effectType: 'HEAL_MORALE',
        primaryValue: 1,
        customDescription: 'Restore 1 morale'
      };

      const c1 = createTestCard('p1_c1', 'p1', [startAbility]);
      const c2 = createTestCard('p1_c2', 'p1', [startAbility]);

      state.players.p1.battlefield.push(
        { slotId: 'slot_0', card: c1, canAttack: false, enteredTurn: 1 },
        { slotId: 'slot_1', card: c2, canAttack: false, enteredTurn: 1 }
      );

      const initialMorale = state.players.p1.morale;
      executeShiftStart(state);

      // With 2 units, previously turn_manager looped 2 units and dispatchTriggers looped 2 units = 4 triggers (+4 Morale).
      // With the fix, dispatchTriggers runs once for the player, executing each unit exactly once (+2 Morale).
      assert.equal(state.players.p1.morale, initialMorale + 2);
    });

    test('START_OF_SHIFT executes exactly 5 times (1 per unit) with 5 eligible units, not 25', () => {
      const state = createMinimalState();
      state.currentPhase = 'SHIFT_START';

      const startAbility: AbilityDefinition = {
        abilityId: 'AB_START_BUFF_5',
        name: 'Full Team Standup',
        trigger: 'START_OF_SHIFT',
        targetFilter: 'FRIENDLY_SUPERVISOR',
        effectType: 'HEAL_MORALE',
        primaryValue: 1,
        customDescription: 'Restore 1 morale'
      };

      for (let i = 0; i < 5; i++) {
        state.players.p1.battlefield.push({
          slotId: `slot_${i}`,
          card: createTestCard(`p1_c${i}`, 'p1', [startAbility]),
          canAttack: false,
          enteredTurn: 1
        });
      }

      const initialMorale = state.players.p1.morale;
      executeShiftStart(state);

      // Previously 5 * 5 = 25 executions (+25 Morale).
      // Now exactly 5 executions (+5 Morale: 20 -> 25).
      assert.equal(state.players.p1.morale, initialMorale + 5);
    });

    test('END_OF_SHIFT executes exactly 2 times with 2 eligible units, not 4', () => {
      const state = createMinimalState();
      state.currentPhase = 'OPERATIONAL_ACTION';

      const endAbility: AbilityDefinition = {
        abilityId: 'AB_END_BUFF',
        name: 'Shift Handover',
        trigger: 'END_OF_SHIFT',
        targetFilter: 'FRIENDLY_SUPERVISOR',
        effectType: 'HEAL_MORALE',
        primaryValue: 2,
        customDescription: 'Restore 2 morale'
      };

      const c1 = createTestCard('p1_c1', 'p1', [endAbility]);
      const c2 = createTestCard('p1_c2', 'p1', [endAbility]);

      state.players.p1.battlefield.push(
        { slotId: 'slot_0', card: c1, canAttack: true, enteredTurn: 1 },
        { slotId: 'slot_1', card: c2, canAttack: true, enteredTurn: 1 }
      );

      const initialMorale = state.players.p1.morale;
      executeClockOut(state);

      // 2 units * 2 Morale = +4 Morale. Duplicate bug would have yielded 4 * 2 = +8 Morale.
      assert.equal(state.players.p1.morale, initialMorale + 4);
    });

    test('Mixed battlefield: only units matching START_OF_SHIFT execute, exactly once', () => {
      const state = createMinimalState();
      state.currentPhase = 'SHIFT_START';

      const startAbility: AbilityDefinition = {
        abilityId: 'AB_START_MORALE',
        name: 'Shift Opener',
        trigger: 'START_OF_SHIFT',
        targetFilter: 'FRIENDLY_SUPERVISOR',
        effectType: 'HEAL_MORALE',
        primaryValue: 3,
        customDescription: 'Restore morale +3'
      };

      const attackAbility: AbilityDefinition = {
        abilityId: 'AB_ATTACK_DMG',
        name: 'Aggressive Strike',
        trigger: 'ON_ATTACK',
        targetFilter: 'ENEMY_SUPERVISOR',
        effectType: 'DAMAGE',
        primaryValue: 2,
        customDescription: 'Deal 2 damage on attack'
      };

      // 2 units with START_OF_SHIFT, 2 units with ON_ATTACK
      state.players.p1.battlefield.push(
        { slotId: 'slot_0', card: createTestCard('p1_c1', 'p1', [startAbility]), canAttack: false, enteredTurn: 1 },
        { slotId: 'slot_1', card: createTestCard('p1_c2', 'p1', [attackAbility]), canAttack: false, enteredTurn: 1 },
        { slotId: 'slot_2', card: createTestCard('p1_c3', 'p1', [startAbility]), canAttack: false, enteredTurn: 1 },
        { slotId: 'slot_3', card: createTestCard('p1_c4', 'p1', [attackAbility]), canAttack: false, enteredTurn: 1 }
      );

      const initialP1Morale = state.players.p1.morale;
      const initialP2Morale = state.players.p2.morale;

      executeShiftStart(state);

      // Exactly 2 start abilities fire: 2 * 3 = +6 P1 morale (20 -> 26)
      assert.equal(state.players.p1.morale, initialP1Morale + 6);
      // ON_ATTACK never fired: P2 morale unchanged
      assert.equal(state.players.p2.morale, initialP2Morale);
    });
  });

  // =========================================================================
  // DEFECT 2: Pending-Decision Suspension & Resumption
  // =========================================================================
  describe('2. Defect 2 — Suspension and Resumption Across Parent Operations', () => {

    test('2A. ON_PLAY followed by ON_DEPLOY: ON_PLAY pauses, resumes to ON_DEPLOY without skip or duplicate', () => {
      const state = createMinimalState();

      const onPlayManual: AbilityDefinition = {
        abilityId: 'AB_ON_PLAY_SELECT',
        name: 'Targeted Allocation',
        trigger: 'ON_PLAY',
        targetFilter: 'ANY_ENEMY_CHARACTER',
        effectType: 'DAMAGE',
        primaryValue: 2,
        requiresManualTarget: true,
        customDescription: 'Deal 2 damage to chosen enemy character'
      };

      const onDeployAuto: AbilityDefinition = {
        abilityId: 'AB_ON_DEPLOY_BUFF',
        name: 'Team Morale Boost',
        trigger: 'ON_DEPLOY',
        targetFilter: 'FRIENDLY_SUPERVISOR',
        effectType: 'HEAL_MORALE',
        primaryValue: 5,
        customDescription: 'Restore 5 morale on deploy'
      };

      // Friendly card with BOTH abilities
      const playedCard = createTestCard('p1_play_deploy', 'p1', [onPlayManual, onDeployAuto]);
      playedCard.currentZone = 'HAND';
      state.players.p1.hand.push(playedCard);

      // Enemy character target
      const enemyTarget = createTestCard('p2_target', 'p2', []);
      enemyTarget.stamina = 4;
      state.players.p2.battlefield.push({
        slotId: 'slot_0',
        card: enemyTarget,
        canAttack: false,
        enteredTurn: 1
      });

      const initialMorale = state.players.p1.morale;

      // Execute PLAY_CARD action
      const deployResult = executeAction(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardInstanceId: playedCard.instanceId
      });

      assert.equal(deployResult.success, true);
      assert.ok(state.pendingDecision !== null && state.pendingDecision.type === 'ABILITY_TARGET_SELECTION');
      assert.equal((state.pendingDecision as any).abilityId, 'AB_ON_PLAY_SELECT');

      // Continuation must be staged for deploy
      const cont = state.pendingContinuation;
      assert.ok(cont && cont.type === 'CONTINUE_DEPLOY');
      assert.equal(cont.stage, 'AWAITING_ON_PLAY');

      // CRITICAL: ON_DEPLOY has NOT executed yet! Friendly morale must be untouched
      assert.equal(state.players.p1.morale, initialMorale);
      // Enemy target not damaged yet
      assert.equal(enemyTarget.stamina, 4);

      // State round-trips cleanly through JSON
      const serialized = serializeGameState(state);
      const restored = deserializeGameState(serialized);
      assert.ok(restored.pendingDecision !== null);
      assert.ok(restored.pendingContinuation !== null);

      // Now resolve the pending ON_PLAY manual target decision
      const resolveResult = executeAction(restored, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: {
          type: 'CHARACTER',
          characterInstanceId: enemyTarget.instanceId
        }
      });

      assert.equal(resolveResult.success, true);
      assert.equal(restored.pendingDecision, null);
      assert.equal(restored.pendingContinuation, null);

      // ON_PLAY effect resolved: enemy took 2 damage (4 -> 2)
      const enemyAfter = restored.players.p2.battlefield.find(s => s.card.instanceId === enemyTarget.instanceId)!;
      assert.equal(enemyAfter.card.stamina, 2);

      // ON_DEPLOY effect resolved seamlessly: friendly morale received +5 boost (20 -> 25)
      assert.equal(restored.players.p1.morale, initialMorale + 5);
    });

    test('2B. ON_ATTACK pauses combat: damage is suspended until decision is resolved', () => {
      const state = createMinimalState();

      const onAttackManual: AbilityDefinition = {
        abilityId: 'AB_ON_ATTACK_TARGET',
        name: 'Tactical Distraction',
        trigger: 'ON_ATTACK',
        targetFilter: 'ANY_ENEMY_CHARACTER',
        effectType: 'DAMAGE',
        primaryValue: 1,
        requiresManualTarget: true,
        customDescription: 'Ping an enemy for 1 damage on attack declaration'
      };

      const attacker = createTestCard('p1_attacker', 'p1', [onAttackManual]);
      attacker.efficiency = 3;
      attacker.stamina = 4;
      state.players.p1.battlefield.push({
        slotId: 'slot_0',
        card: attacker,
        canAttack: true,
        enteredTurn: 0 // Ready to attack
      });

      const defender = createTestCard('p2_defender', 'p2', []);
      defender.efficiency = 2;
      defender.stamina = 5;
      state.players.p2.battlefield.push({
        slotId: 'slot_0',
        card: defender,
        canAttack: false,
        enteredTurn: 0
      });

      // Declare attack against defender
      const attackResult = executeAction(state, {
        type: 'DECLARE_ATTACK',
        playerId: 'p1',
        attackerInstanceId: attacker.instanceId,
        target: {
          type: 'CHARACTER',
          characterInstanceId: defender.instanceId
        }
      });

      assert.equal(attackResult.success, true);

      // Combat must be SUSPENDED at ON_ATTACK decision
      assert.ok(state.pendingDecision !== null && state.pendingDecision.type === 'ABILITY_TARGET_SELECTION');
      assert.equal((state.pendingDecision as any).abilityId, 'AB_ON_ATTACK_TARGET');

      // Continuation must preserve combat target
      const cont = state.pendingContinuation;
      assert.ok(cont && cont.type === 'CONTINUE_COMBAT');
      assert.equal(cont.attackerInstanceId, attacker.instanceId);

      // CRITICAL: Combat damage must NOT have been dealt yet!
      assert.equal(attacker.stamina, 4);
      assert.equal(defender.stamina, 5);

      // Attacker was exhausted upon declaration
      assert.equal(state.players.p1.battlefield[0].canAttack, false);

      // Verify JSON serialization preservation during suspended combat
      const serialized = serializeGameState(state);
      const restored = deserializeGameState(serialized);

      // Resolve the ON_ATTACK target (target the defender for the 1 ping damage)
      const resolveResult = executeAction(restored, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: {
          type: 'CHARACTER',
          characterInstanceId: defender.instanceId
        }
      });

      assert.equal(resolveResult.success, true);
      assert.equal(restored.pendingDecision, null);
      assert.equal(restored.pendingContinuation, null);

      // Defender took 1 damage from ON_ATTACK ping (5 -> 4),
      // then took 3 combat damage from attacker (4 -> 1).
      // Attacker took 2 simultaneous combat damage from defender (4 -> 2).
      const finalAttacker = restored.players.p1.battlefield.find(s => s.card.instanceId === attacker.instanceId)!;
      const finalDefender = restored.players.p2.battlefield.find(s => s.card.instanceId === defender.instanceId)!;

      assert.equal(finalDefender.card.stamina, 1);
      assert.equal(finalAttacker.card.stamina, 2);
    });

    test('2C. END_OF_SHIFT pauses before cleanup: buff expiration and turn advance wait for decision', () => {
      const state = createMinimalState();
      state.currentPhase = 'OPERATIONAL_ACTION';

      const endManualAbility: AbilityDefinition = {
        abilityId: 'AB_END_MANUAL',
        name: 'Late Night Review',
        trigger: 'END_OF_SHIFT',
        targetFilter: 'ENEMY_SUPERVISOR',
        effectType: 'DAMAGE',
        primaryValue: 2,
        requiresManualTarget: true,
        customDescription: 'Choose supervisor to take 2 damage'
      };

      const card = createTestCard('p1_end_unit', 'p1', [endManualAbility]);
      // Give card a temporary stamina buff that should expire at end of shift
      card.temporaryStaminaBuffer = 2;
      card.maxStamina = 5;
      card.stamina = 5;

      state.players.p1.battlefield.push({
        slotId: 'slot_0',
        card,
        canAttack: true,
        enteredTurn: 1
      });

      // Give player temporary Shift hours
      state.players.p1.temporaryShift = 3;
      state.players.p1.currentShift = 6;

      // Advance to Clock Out phase
      const phaseResult = advanceToNextPhase(state);
      assert.equal(phaseResult.success, true);

      // Decision was created during END_OF_SHIFT
      assert.ok(state.pendingDecision !== null);
      assert.equal(state.pendingDecision.type, 'ABILITY_TARGET_SELECTION');
      const cont = state.pendingContinuation;
      assert.ok(cont && cont.type === 'CONTINUE_CLOCK_OUT');

      // CRITICAL: Cleanup must NOT have occurred yet!
      // Buff must still be present
      assert.equal(card.temporaryStaminaBuffer, 2);
      assert.equal(card.stamina, 5);
      // Temporary shift must not have cleared yet
      assert.equal(state.players.p1.temporaryShift, 3);
      // Active player must still be p1 (has not switched to p2)
      assert.equal(state.activePlayerId, 'p1');
      assert.equal(state.currentPhase, 'CLOCK_OUT');

      // Resolve the END_OF_SHIFT target decision
      const resolveResult = executeAction(state, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: {
          type: 'SUPERVISOR',
          playerId: 'p2'
        }
      });

      assert.equal(resolveResult.success, true);
      assert.equal(state.pendingDecision, null);
      assert.equal(state.pendingContinuation, null);

      // P2 supervisor took 2 damage (30 -> 28)
      assert.equal(state.players.p2.morale, 28);

      // Now cleanup has completed:
      // Temporary buffer expired and clamped
      assert.equal(card.temporaryStaminaBuffer, 0);
      assert.equal(card.stamina, 3);
      assert.equal(card.maxStamina, 3);

      // Temporary shift cleared
      assert.equal(state.players.p1.temporaryShift, 0);
      assert.equal(state.players.p1.currentShift, 0);

      // Turn advanced to Player 2
      assert.equal(state.activePlayerId, 'p2');
      assert.equal(state.currentPhase, 'SHIFT_START');
    });

    test('2D. Sequential FIFO queue: multiple independent manual triggers do not overwrite pending decisions', () => {
      const state = createMinimalState();

      const manualDecisionAbility1: AbilityDefinition = {
        abilityId: 'AB_MANUAL_1',
        name: 'First Protocol',
        trigger: 'ON_PLAY',
        targetFilter: 'ENEMY_SUPERVISOR',
        effectType: 'DAMAGE',
        primaryValue: 3,
        requiresManualTarget: true,
        customDescription: 'First target decision'
      };

      const manualDecisionAbility2: AbilityDefinition = {
        abilityId: 'AB_MANUAL_2',
        name: 'Second Protocol',
        trigger: 'ON_PLAY',
        targetFilter: 'FRIENDLY_SUPERVISOR',
        effectType: 'HEAL_MORALE',
        primaryValue: 4,
        requiresManualTarget: true,
        customDescription: 'Second target decision'
      };

      const card = createTestCard('p1_multi', 'p1', [manualDecisionAbility1, manualDecisionAbility2]);
      card.currentZone = 'HAND';
      state.players.p1.hand.push(card);

      // Play the card
      const playRes = executeAction(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardInstanceId: card.instanceId
      });

      assert.equal(playRes.success, true);

      // First decision is presented
      assert.ok(state.pendingDecision !== null && state.pendingDecision.type === 'ABILITY_TARGET_SELECTION');
      assert.equal((state.pendingDecision as any).abilityId, 'AB_MANUAL_1');

      // Second decision is queued safely in pendingTriggerQueue
      assert.ok(state.pendingTriggerQueue && state.pendingTriggerQueue.length === 1);
      assert.equal(state.pendingTriggerQueue[0].ability.abilityId, 'AB_MANUAL_2');

      // Resolve decision 1
      const res1 = executeAction(state, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: {
          type: 'SUPERVISOR',
          playerId: 'p2'
        }
      });

      assert.equal(res1.success, true);
      // P2 morale took 3 damage (30 -> 27)
      assert.equal(state.players.p2.morale, 27);

      // Decision 2 popped from queue and is now pending!
      assert.ok(state.pendingDecision !== null && state.pendingDecision.type === 'ABILITY_TARGET_SELECTION');
      assert.equal((state.pendingDecision as any).abilityId, 'AB_MANUAL_2');
      assert.equal(state.pendingTriggerQueue.length, 0);

      // Resolve decision 2
      const res2 = executeAction(state, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: {
          type: 'SUPERVISOR',
          playerId: 'p1'
        }
      });

      assert.equal(res2.success, true);
      // P1 morale gained +4 (20 -> 24)
      assert.equal(state.players.p1.morale, 24);
      assert.equal(state.pendingDecision, null);
    });
  });

  // =========================================================================
  // DEFECT 3: Execution Budget Candidate Preservation
  // =========================================================================
  describe('3. Defect 3 — Execution Budget Exhaustion Preserves Candidates', () => {

    test('Dispatch begins at budget 48 with 5 candidates: 2 execute, 3 preserved in queue, candidate 51 never runs', () => {
      const state = createMinimalState();

      const budgetAbility: AbilityDefinition = {
        abilityId: 'AB_BUDGET_TEST',
        name: 'Budget Count',
        trigger: 'START_OF_SHIFT',
        targetFilter: 'SELF',
        effectType: 'BUFF_STAT',
        primaryValue: 1,
        customDescription: 'Increment counter'
      };

      // 5 units on battlefield
      for (let i = 0; i < 5; i++) {
        state.players.p1.battlefield.push({
          slotId: `slot_${i}`,
          card: createTestCard(`p1_unit_${i}`, 'p1', [budgetAbility]),
          canAttack: false,
          enteredTurn: 1
        });
      }

      const execContext: ExecutionContext = {
        depth: 1,
        budgetCount: 48 // Starts at 48
      };

      const res = dispatchTriggers(state, 'START_OF_SHIFT', {
        trigger: 'START_OF_SHIFT',
        sourceInstanceId: '',
        sourcePlayerId: 'p1'
      }, execContext);

      // Budget count reached MAX_EXECUTION_BUDGET (50)
      assert.equal(execContext.budgetCount, 50);

      // Candidate 0 ran at budget 49
      // Candidate 1 ran at budget 50
      // Candidates 2, 3, 4 could not run and MUST be preserved in pendingTriggerQueue
      assert.ok(state.pendingTriggerQueue && state.pendingTriggerQueue.length === 3);
      assert.equal(state.pendingTriggerQueue[0].sourceInstanceId, 'p1_unit_2');
      assert.equal(state.pendingTriggerQueue[1].sourceInstanceId, 'p1_unit_3');
      assert.equal(state.pendingTriggerQueue[2].sourceInstanceId, 'p1_unit_4');

      // Candidate 51 never executed
      assert.ok(execContext.budgetCount <= 50);
    });

    test('Dispatch begins at budget 50: all 5 candidates preserved in pendingTriggerQueue, 0 execute', () => {
      const state = createMinimalState();

      const budgetAbility: AbilityDefinition = {
        abilityId: 'AB_EXHAUSTED',
        name: 'Exhausted Ability',
        trigger: 'START_OF_SHIFT',
        targetFilter: 'SELF',
        effectType: 'BUFF_STAT',
        primaryValue: 1,
        customDescription: 'Should not run'
      };

      for (let i = 0; i < 5; i++) {
        state.players.p1.battlefield.push({
          slotId: `slot_${i}`,
          card: createTestCard(`p1_b50_${i}`, 'p1', [budgetAbility]),
          canAttack: false,
          enteredTurn: 1
        });
      }

      const execContext: ExecutionContext = {
        depth: 1,
        budgetCount: 50 // Exactly at max limit
      };

      const res = dispatchTriggers(state, 'START_OF_SHIFT', {
        trigger: 'START_OF_SHIFT',
        sourceInstanceId: '',
        sourcePlayerId: 'p1'
      }, execContext);

      // Budget did not increase
      assert.equal(execContext.budgetCount, 50);

      // All 5 candidates preserved in queue
      assert.ok(state.pendingTriggerQueue && state.pendingTriggerQueue.length === 5);
      for (let i = 0; i < 5; i++) {
        assert.equal(state.pendingTriggerQueue[i].sourceInstanceId, `p1_b50_${i}`);
      }
    });

    test('Budget limit holds during manual target decision resolution with queued triggers', () => {
      const state = createMinimalState();

      const manualAb: AbilityDefinition = {
        abilityId: 'AB_MANUAL_BUDGET',
        name: 'Manual Decision',
        trigger: 'ON_PLAY',
        targetFilter: 'ENEMY_SUPERVISOR',
        effectType: 'DAMAGE',
        primaryValue: 1,
        requiresManualTarget: true,
        customDescription: 'Manual choice'
      };

      const queuedAb: AbilityDefinition = {
        abilityId: 'AB_QUEUED_BUDGET',
        name: 'Queued Followup',
        trigger: 'ON_PLAY',
        targetFilter: 'ENEMY_SUPERVISOR',
        effectType: 'DAMAGE',
        primaryValue: 1,
        customDescription: 'Auto followup'
      };

      const srcCard = createTestCard('src_card', 'p1', [manualAb]);
      state.players.p1.battlefield.push({
        slotId: 'slot_0',
        card: srcCard,
        canAttack: true,
        enteredTurn: 1
      });

      // Set up pending decision with executionContext budget at 49
      state.pendingDecision = {
        type: 'ABILITY_TARGET_SELECTION',
        playerId: 'p1',
        sourceInstanceId: 'src_card',
        sourceCardName: 'Test Card',
        abilityId: 'AB_MANUAL_BUDGET',
        effectType: 'DAMAGE',
        value: 1,
        targetFilter: 'ENEMY_SUPERVISOR',
        allowedTargets: [{ target: { type: 'SUPERVISOR', playerId: 'p2' }, label: 'P2', isFriendly: false }],
        executionContext: { depth: 1, budgetCount: 49 }
      };

      // Add two queued triggers in pendingTriggerQueue
      state.pendingTriggerQueue = [
        {
          sourceInstanceId: 'src_card',
          sourcePlayerId: 'p1',
          ability: queuedAb,
          trigger: 'ON_PLAY',
          executionContext: { depth: 1, budgetCount: 49 }
        },
        {
          sourceInstanceId: 'src_card',
          sourcePlayerId: 'p1',
          ability: queuedAb,
          trigger: 'ON_PLAY',
          executionContext: { depth: 1, budgetCount: 49 }
        }
      ];

      const initialP2Morale = state.players.p2.morale;

      // Resolving the manual decision executes its effect (1 damage).
      // Then the queue drains: q1 executes at budget 49 -> 50 (1 damage).
      // Next, q2 (candidate 51) checks budget 50 >= 50 and halts.
      // Total 2 damage dealt (30 -> 28). Candidate 51 (q2) never runs!
      const res = executeAction(state, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: {
          type: 'SUPERVISOR',
          playerId: 'p2'
        }
      });

      assert.equal(res.success, true);
      assert.equal(state.players.p2.morale, initialP2Morale - 2);

      // Remaining candidate 51 (q2) stays preserved in pendingTriggerQueue
      assert.ok(state.pendingTriggerQueue && state.pendingTriggerQueue.length === 1);
      assert.equal(state.pendingTriggerQueue[0].ability.abilityId, 'AB_QUEUED_BUDGET');
    });
  });

  // =========================================================================
  // DEFECT 4: Centralized ON_CLOCK_OUT Snapshot Validation & Teammate Isolation
  // =========================================================================
  describe('4. Defect 4 — Centralized ON_CLOCK_OUT Snapshot Validation', () => {

    const clockOutAbility: AbilityDefinition = {
      abilityId: 'AB_HANDOVER',
      name: 'Handover Protocol',
      trigger: 'ON_CLOCK_OUT',
      targetFilter: 'FRIENDLY_SUPERVISOR',
      effectType: 'HEAL_MORALE',
      primaryValue: 3,
      customDescription: 'Restore 3 morale to supervisor on departure'
    };

    test('Lethal damage (zero stamina) triggers ON_CLOCK_OUT strictly once via SBA', () => {
      const state = createMinimalState();
      state.players.p1.morale = 20; // Set to 20 so +3 heal is observable (not capped at 30)

      const deadCard = createTestCard('p1_dead', 'p1', [clockOutAbility]);
      deadCard.stamina = 0; // Lethal damage

      state.players.p1.battlefield.push({
        slotId: 'slot_0',
        card: deadCard,
        canAttack: true,
        enteredTurn: 1
      });

      const initialMorale = state.players.p1.morale;
      evaluateStateBasedActions(state);

      // Unit moved to Breakroom
      assert.equal(state.players.p1.battlefield.length, 0);
      assert.equal(deadCard.currentZone, 'BREAKROOM');
      assert.equal(deadCard.hasTriggeredClockOut, true);

      // Handover Protocol resolved: Morale healed +3 (20 -> 23)
      assert.equal(state.players.p1.morale, initialMorale + 3);

      // Evaluating SBAs again must NOT trigger duplicate ON_CLOCK_OUT
      evaluateStateBasedActions(state);
      assert.equal(state.players.p1.morale, initialMorale + 3);
    });

    test('Direct DESTROY_CHARACTER captures departing snapshot and triggers ON_CLOCK_OUT once', () => {
      const state = createMinimalState();
      state.players.p1.morale = 20;

      const victim = createTestCard('p1_victim', 'p1', [clockOutAbility]);
      victim.stamina = 5; // Healthy character

      state.players.p1.battlefield.push({
        slotId: 'slot_0',
        card: victim,
        canAttack: true,
        enteredTurn: 1
      });

      const initialMorale = state.players.p1.morale;

      const destroyAb: AbilityDefinition = {
        abilityId: 'AB_DESTROY',
        name: 'Terminate',
        trigger: 'ON_PLAY',
        targetFilter: 'ANY_FRIENDLY_CHARACTER',
        effectType: 'DESTROY_CHARACTER',
        primaryValue: 0,
        customDescription: 'Direct destruction'
      };

      const res = resolveAbilityEffect(state, 'p1', 'admin_src', destroyAb, {
        type: 'CHARACTER',
        characterInstanceId: victim.instanceId
      });

      assert.equal(res.success, true);
      assert.equal(state.players.p1.battlefield.length, 0);
      assert.equal(victim.currentZone, 'BREAKROOM');
      assert.equal(victim.hasTriggeredClockOut, true);

      // Fired ON_CLOCK_OUT even though stamina was not 0 initially (20 -> 23)
      assert.equal(state.players.p1.morale, initialMorale + 3);
    });

    test('Missing departingCard snapshot is rejected by dispatchTriggers', () => {
      const state = createMinimalState();

      const res = dispatchTriggers(state, 'ON_CLOCK_OUT', {
        trigger: 'ON_CLOCK_OUT',
        sourceInstanceId: 'inst_missing',
        sourcePlayerId: 'p1'
        // departingCard is omitted
      });

      assert.equal(res.success, false);
      assert.ok(res.events.some(e => e.includes('Missing departing card snapshot')));
    });

    test('Mismatched instanceId is rejected', () => {
      const state = createMinimalState();
      const snapshot = createTestCard('inst_real', 'p1', [clockOutAbility]);
      snapshot.currentZone = 'BREAKROOM';

      const res = dispatchTriggers(state, 'ON_CLOCK_OUT', {
        trigger: 'ON_CLOCK_OUT',
        sourceInstanceId: 'inst_DIFFERENT',
        sourcePlayerId: 'p1',
        departingCard: snapshot
      });

      assert.equal(res.success, false);
      assert.ok(res.events.some(e => e.includes('does not match sourceInstanceId')));
    });

    test('Mismatched ownerId is rejected', () => {
      const state = createMinimalState();
      const snapshot = createTestCard('inst_p2', 'p2', [clockOutAbility]);
      snapshot.currentZone = 'BREAKROOM';

      const res = dispatchTriggers(state, 'ON_CLOCK_OUT', {
        trigger: 'ON_CLOCK_OUT',
        sourceInstanceId: 'inst_p2',
        sourcePlayerId: 'p1', // Mismatched player
        departingCard: snapshot
      });

      assert.equal(res.success, false);
      assert.ok(res.events.some(e => e.includes('does not match sourcePlayerId')));
    });

    test('Character still on battlefield is rejected', () => {
      const state = createMinimalState();
      const card = createTestCard('p1_on_board', 'p1', [clockOutAbility]);

      state.players.p1.battlefield.push({
        slotId: 'slot_0',
        card,
        canAttack: true,
        enteredTurn: 1
      });

      const res = dispatchTriggers(state, 'ON_CLOCK_OUT', {
        trigger: 'ON_CLOCK_OUT',
        sourceInstanceId: card.instanceId,
        sourcePlayerId: 'p1',
        departingCard: card
      });

      assert.equal(res.success, false);
      assert.ok(res.events.some(e => e.includes('still present on battlefield')));
    });

    test('Duplicate dispatch call is rejected (hasTriggeredClockOut)', () => {
      const state = createMinimalState();
      const card = createTestCard('p1_already_triggered', 'p1', [clockOutAbility]);
      card.currentZone = 'BREAKROOM';
      card.hasTriggeredClockOut = true; // Already triggered

      const res = dispatchTriggers(state, 'ON_CLOCK_OUT', {
        trigger: 'ON_CLOCK_OUT',
        sourceInstanceId: card.instanceId,
        sourcePlayerId: 'p1',
        departingCard: card
      });

      assert.equal(res.success, false);
      assert.ok(res.events.some(e => e.includes('already triggered ON_CLOCK_OUT')));
    });

    test('Teammate isolation: surviving teammates do not trigger when an ally clocks out', () => {
      const state = createMinimalState();
      state.players.p1.morale = 20;

      // Departing unit
      const departing = createTestCard('p1_departing', 'p1', [clockOutAbility]);
      departing.stamina = 0;

      // Teammate ALSO has clockOutAbility, but is healthy and remains on battlefield
      const teammate = createTestCard('p1_teammate', 'p1', [clockOutAbility]);
      teammate.stamina = 4;

      state.players.p1.battlefield.push(
        { slotId: 'slot_0', card: departing, canAttack: true, enteredTurn: 1 },
        { slotId: 'slot_1', card: teammate, canAttack: true, enteredTurn: 1 }
      );

      const initialMorale = state.players.p1.morale;
      evaluateStateBasedActions(state);

      // Only 1 card clocked out (departing), so morale should increase by +3, NOT +6!
      assert.equal(state.players.p1.battlefield.length, 1);
      assert.equal(state.players.p1.battlefield[0].card.instanceId, teammate.instanceId);
      assert.equal(teammate.hasTriggeredClockOut, false);
      assert.equal(state.players.p1.morale, initialMorale + 3);
    });

    test('RETURN_TO_HAND restores base template and does NOT trigger ON_CLOCK_OUT', () => {
      const state = createMinimalState();

      const unit = createTestCard('p1_bounce', 'p1', [clockOutAbility]);
      // Give unit stat buffs and damage
      unit.efficiency = 6;
      unit.maxStamina = 8;
      unit.stamina = 4;
      unit.temporaryStaminaBuffer = 3;

      state.players.p1.battlefield.push({
        slotId: 'slot_0',
        card: unit,
        canAttack: true,
        enteredTurn: 1
      });

      const initialMorale = state.players.p1.morale;

      const returnAb: AbilityDefinition = {
        abilityId: 'AB_RECALL',
        name: 'Administrative Recall',
        trigger: 'ON_PLAY',
        targetFilter: 'ANY_FRIENDLY_CHARACTER',
        effectType: 'RETURN_TO_HAND',
        primaryValue: 0,
        customDescription: 'Return to hand'
      };

      const res = resolveAbilityEffect(state, 'p1', 'admin_src', returnAb, {
        type: 'CHARACTER',
        characterInstanceId: unit.instanceId
      });

      assert.equal(res.success, true);
      assert.equal(state.players.p1.battlefield.length, 0);
      assert.equal(state.players.p1.hand.length, 1);

      const inHand = state.players.p1.hand[0];
      assert.equal(inHand.instanceId, unit.instanceId);
      assert.equal(inHand.currentZone, 'HAND');

      // Base stats restored
      assert.equal(inHand.efficiency, 2);
      assert.equal(inHand.stamina, 3);
      assert.equal(inHand.maxStamina, 3);
      assert.equal(inHand.temporaryStaminaBuffer, 0);

      // ON_CLOCK_OUT must NOT have fired
      assert.equal(inHand.hasTriggeredClockOut, false);
      assert.equal(state.players.p1.morale, initialMorale);
    });

    test('SILENCE_CHARACTER does not trigger ON_CLOCK_OUT', () => {
      const state = createMinimalState();

      const unit = createTestCard('p1_silenced', 'p1', [clockOutAbility]);
      state.players.p1.battlefield.push({
        slotId: 'slot_0',
        card: unit,
        canAttack: true,
        enteredTurn: 1
      });

      const initialMorale = state.players.p1.morale;

      const silenceAb: AbilityDefinition = {
        abilityId: 'AB_SILENCE',
        name: 'Silence Protocol',
        trigger: 'ON_PLAY',
        targetFilter: 'ANY_FRIENDLY_CHARACTER',
        effectType: 'SILENCE_CHARACTER',
        primaryValue: 0,
        customDescription: 'Silence unit'
      };

      const res = resolveAbilityEffect(state, 'p1', 'admin_src', silenceAb, {
        type: 'CHARACTER',
        characterInstanceId: unit.instanceId
      });

      assert.equal(res.success, true);
      assert.equal(unit.isSilenced, true);
      assert.equal(unit.abilities?.length, 0);
      assert.equal(unit.hasTriggeredClockOut, false);
      assert.equal(state.players.p1.morale, initialMorale);
    });
  });
});
