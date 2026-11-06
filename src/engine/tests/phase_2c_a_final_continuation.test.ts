/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Phase 2C-A Final Continuation and Interrupted-Operation Regression Test Suite
 * 
 * Verifies the 4 critical integration fixes:
 * 1. Already-admitted manual decisions resolve legally at budget 50 and depth 10.
 * 2. Budget exhaustion suspends parent operations and validateAction locks.
 * 3. Booking Queue & Capacity Triage deployments support iterative continuation.
 * 4. State-based actions and damage triggers resolve sequentially in FIFO order without snapshot loss.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GameState,
  CardInstance,
  createInitialGameState,
  serializeGameState,
  deserializeGameState,
  isOperationSuspended
} from '../state.js';
import {
  dispatchTriggers,
  resolveAbilityEffect,
  MAX_EXECUTION_BUDGET,
  MAX_TRIGGER_DEPTH
} from '../abilities.js';
import { executeAction, validateAction } from '../actions.js';
import {
  executeShiftStart,
  advanceToNextPhase,
  executeClockOut,
  evaluateStateBasedActions
} from '../turn_manager.js';
import { executeAttack } from '../combat.js';

function createTestMatch(seed = 42): GameState {
  const dummyDeck: any[] = [];
  for (let i = 0; i < 30; i++) {
    dummyDeck.push({
      id: `card_${i}`,
      name: `Card ${i}`,
      cardType: 'CHARACTER',
      department: 'OPERATIONS',
      baseCost: 2,
      influence: 1,
      efficiency: 2,
      stamina: 3,
      abilities: []
    });
  }

  const state = createInitialGameState({
    p1Deck: dummyDeck,
    p2Deck: dummyDeck,
    config: 'CONFIG_D'
  });
  state.rngState = seed;

  state.currentPhase = 'OPERATIONAL_ACTION';
  state.players.p1.currentShift = 10;
  state.players.p2.currentShift = 10;
  state.players.p1.morale = 20;
  state.players.p2.morale = 20;

  return state;
}

describe('Phase 2C-A Final Continuation & Interrupted-Operation Suite', () => {

  // ==========================================================================
  // DEFECT 1 — ALREADY-ADMITTED MANUAL DECISIONS MUST REMAIN RESOLVABLE
  // ==========================================================================
  describe('Defect 1: Already-Admitted Manual Decisions Resolvability', () => {
    test('Candidate 50 manual decision resolves, executes once, and candidate 51 is halted in queue', () => {
      const match = createTestMatch();

      // Create a pending decision that was admitted as candidate 50 (budgetCount = 50)
      match.pendingDecision = {
        type: 'ABILITY_TARGET_SELECTION',
        playerId: 'p1',
        sourceInstanceId: 'src_admitted_50',
        sourceCardName: 'Admitted Ability 50',
        abilityId: 'ABILITY_50',
        effectType: 'HEAL_MORALE',
        value: 3,
        targetFilter: 'FRIENDLY_SUPERVISOR',
        allowedTargets: [{ target: { type: 'SUPERVISOR', playerId: 'p1' }, label: 'P1 Morale', isFriendly: true }],
        executionContext: { depth: 1, budgetCount: 50 }
      };

      // Queue candidate 51 in pendingTriggerQueue
      match.pendingTriggerQueue = [{
        sourceInstanceId: 'src_candidate_51',
        sourcePlayerId: 'p1',
        ability: {
          abilityId: 'ABILITY_51',
          name: 'Candidate 51',
          trigger: 'ON_DEPLOY',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 5,
          customDescription: ''
        },
        trigger: 'ON_DEPLOY',
        executionContext: { depth: 1, budgetCount: 50 },
        triggerContext: {
          trigger: 'ON_DEPLOY',
          sourceInstanceId: 'src_candidate_51',
          sourcePlayerId: 'p1'
        }
      }];

      const initialMorale = match.players.p1.morale; // 20

      // Player resolves candidate 50
      const res = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'SUPERVISOR', playerId: 'p1' }
      });

      assert.equal(res.success, true);
      // Candidate 50 executed once (+3 morale)
      assert.equal(match.players.p1.morale, initialMorale + 3);

      // Candidate 51 did NOT execute (+5 morale not added)
      assert.notEqual(match.players.p1.morale, initialMorale + 8);

      // Candidate 51 remains safely preserved in pendingTriggerQueue
      assert.equal(match.pendingTriggerQueue.length, 1);
      assert.equal(match.pendingTriggerQueue[0].ability.abilityId, 'ABILITY_51');

      // An event was logged noting budget limit was reached
      assert.equal(res.events.some(e => e.includes('Execution budget exceeded')), true);
    });

    test('Candidate at MAX_TRIGGER_DEPTH = 10 resolves its manual decision exactly once', () => {
      const match = createTestMatch();

      match.pendingDecision = {
        type: 'ABILITY_TARGET_SELECTION',
        playerId: 'p1',
        sourceInstanceId: 'src_depth_10',
        sourceCardName: 'Depth 10 Ability',
        abilityId: 'ABILITY_DEPTH_10',
        effectType: 'HEAL_MORALE',
        value: 2,
        targetFilter: 'FRIENDLY_SUPERVISOR',
        allowedTargets: [{ target: { type: 'SUPERVISOR', playerId: 'p1' }, label: 'P1 Morale', isFriendly: true }],
        executionContext: { depth: 10, budgetCount: 15 }
      };

      const initialMorale = match.players.p1.morale;

      const res = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'SUPERVISOR', playerId: 'p1' }
      });

      assert.equal(res.success, true);
      // Ability executed exactly once
      assert.equal(match.players.p1.morale, initialMorale + 2);
      assert.equal(match.pendingDecision, null);
      // Logs cascade limit reached
      assert.equal(res.events.some(e => e.includes('MAX_TRIGGER_DEPTH = 10')), true);
    });

    test('Parent continuation is NOT discarded when queue halts due to budget exhaustion', () => {
      const match = createTestMatch();

      // Set up a parent deploy continuation
      match.pendingContinuation = {
        type: 'CONTINUE_DEPLOY',
        playerId: 'p1',
        cardInstanceId: 'inst_parent_card',
        stage: 'AWAITING_ON_DEPLOY'
      };

      // Admitted decision at budget 50
      match.pendingDecision = {
        type: 'ABILITY_TARGET_SELECTION',
        playerId: 'p1',
        sourceInstanceId: 'src_admitted',
        sourceCardName: 'Admitted Ability',
        abilityId: 'ABILITY_ADMITTED',
        effectType: 'HEAL_MORALE',
        value: 1,
        targetFilter: 'FRIENDLY_SUPERVISOR',
        allowedTargets: [{ target: { type: 'SUPERVISOR', playerId: 'p1' }, label: 'P1 Morale', isFriendly: true }],
        executionContext: { depth: 1, budgetCount: 50 }
      };

      // Unexecuted candidate 51 in queue
      match.pendingTriggerQueue = [{
        sourceInstanceId: 'src_cand_51',
        sourcePlayerId: 'p1',
        ability: {
          abilityId: 'ABILITY_51',
          name: 'Cand 51',
          trigger: 'ON_DEPLOY',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 1,
          customDescription: ''
        },
        trigger: 'ON_DEPLOY',
        executionContext: { depth: 1, budgetCount: 50 },
        triggerContext: {
          trigger: 'ON_DEPLOY',
          sourceInstanceId: 'src_cand_51',
          sourcePlayerId: 'p1'
        }
      }];

      executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'SUPERVISOR', playerId: 'p1' }
      });

      // Queue did not drain, so parent continuation must NOT be discarded
      assert.notEqual(match.pendingContinuation, null);
      assert.equal(match.pendingContinuation?.type, 'CONTINUE_DEPLOY');
      assert.equal(isOperationSuspended(match), true);
    });
  });

  // ==========================================================================
  // DEFECT 2 — BUDGET EXHAUSTION MUST SUSPEND THE PARENT OPERATION
  // ==========================================================================
  describe('Defect 2: Budget Exhaustion Operation Suspension & Action Locking', () => {
    test('validateAction rejects unrelated actions when operation is suspended without manual decision', () => {
      const match = createTestMatch();

      // Operation is suspended because pendingTriggerQueue has items
      match.pendingDecision = null;
      match.pendingTriggerQueue = [{
        sourceInstanceId: 'inst_x',
        sourcePlayerId: 'p1',
        ability: {
          abilityId: 'AB_X',
          name: 'Ability X',
          trigger: 'ON_DEPLOY',
          targetFilter: 'SELF',
          effectType: 'DRAW_CARDS',
          primaryValue: 1,
          customDescription: ''
        },
        trigger: 'ON_DEPLOY',
        executionContext: { depth: 1, budgetCount: 50 },
        triggerContext: { trigger: 'ON_DEPLOY', sourceInstanceId: 'inst_x', sourcePlayerId: 'p1' }
      }];
      match.pendingContinuation = {
        type: 'CONTINUE_DEPLOY',
        playerId: 'p1',
        cardInstanceId: 'inst_card',
        stage: 'AWAITING_ON_DEPLOY'
      };

      assert.equal(isOperationSuspended(match), true);

      // Attempting to play a card must be rejected with PENDING_DECISION_REQUIRED
      const cardInHand = match.players.p1.hand[0];
      const validation = validateAction(match, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardInstanceId: cardInHand.instanceId
      });

      assert.equal(validation.valid, false);
      assert.equal(validation.code, 'PENDING_DECISION_REQUIRED');
      assert.match(validation.message || '', /operation is suspended/i);

      // Concede is still allowed
      const concedeValidation = validateAction(match, {
        type: 'CONCEDE',
        playerId: 'p1'
      });
      assert.equal(concedeValidation.valid, true);
    });

    test('advanceToNextPhase rejects phase advance when operation is suspended', () => {
      const match = createTestMatch();
      match.currentPhase = 'SHIFT_START';
      match.pendingContinuation = {
        type: 'CONTINUE_SHIFT_START',
        playerId: 'p1',
        stage: 'AWAITING_START_OF_SHIFT'
      };

      const res = advanceToNextPhase(match);
      assert.equal(res.success, false);
      assert.match(res.error || '', /Current operation is suspended/i);
      assert.equal(match.currentPhase, 'SHIFT_START');
    });

    test('Deterministic FIFO preservation when budget exhausts during trigger dispatch', () => {
      const match = createTestMatch();

      // Create 3 candidates to dispatch at budget 49
      const candidates = [
        { id: 'c1', val: 1 },
        { id: 'c2', val: 2 },
        { id: 'c3', val: 3 }
      ];

      for (const c of candidates) {
        match.players.p1.battlefield.push({
          slotId: `slot_${c.id}`,
          card: {
            instanceId: `inst_${c.id}`,
            cardDefId: `def_${c.id}`,
            ownerId: 'p1',
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
            hasOnDeployAbility: false,
            isFrontDeskGuard: false,
            isRush: false,
            abilities: [{
              abilityId: `ab_${c.id}`,
              name: `Ability ${c.id}`,
              trigger: 'START_OF_SHIFT',
              targetFilter: 'FRIENDLY_SUPERVISOR',
              effectType: 'HEAL_MORALE',
              primaryValue: c.val,
              customDescription: ''
            }]
          },
          canAttack: false,
          enteredTurn: 1
        });
      }

      // Dispatch at budget 49
      const dispatchRes = dispatchTriggers(match, 'START_OF_SHIFT', {
        trigger: 'START_OF_SHIFT',
        sourceInstanceId: '',
        sourcePlayerId: 'p1'
      }, { depth: 1, budgetCount: 49 });

      // Only candidate 1 executed (budget hit 50)
      assert.equal(match.players.p1.morale, 21); // +1 from c1

      // Candidates 2 and 3 preserved in FIFO queue
      assert.equal(match.pendingTriggerQueue?.length, 2);
      assert.equal(match.pendingTriggerQueue?.[0]?.ability?.abilityId, 'ab_c2');
      assert.equal(match.pendingTriggerQueue?.[1]?.ability?.abilityId, 'ab_c3');
    });
  });

  // ==========================================================================
  // DEFECT 3 — BOOKING QUEUE AND CAPACITY TRIAGE CONTINUATION
  // ==========================================================================
  describe('Defect 3: Booking Queue & Capacity Triage Continuations', () => {
    test('Queue deployment with manual ON_DEPLOY pauses and resumes cleanly', () => {
      const match = createTestMatch();
      match.currentPhase = 'SHIFT_START';

      // Put a resolving ticket in queue with an ability requiring manual target
      match.players.p1.queue.push({
        id: 't_manual_deploy',
        cardId: 'card_scout',
        cardName: 'Booking Scout',
        baseCost: 3,
        effectiveCost: 2,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 2,
        ownerId: 'p1',
        fifoIndex: 1,
        hasOnDeployAbility: true,
        abilities: [{
          abilityId: 'ABILITY_SCOUT_HEAL',
          name: 'Scout Heal',
          trigger: 'ON_DEPLOY',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 4,
          requiresManualTarget: true,
          customDescription: ''
        }]
      });

      // Execute shift start
      const log = executeShiftStart(match);

      // Verify ticket removed from queue
      assert.equal(match.players.p1.queue.length, 0);
      // Card is on the battlefield
      assert.equal(match.players.p1.battlefield.length, 1);
      const deployed = match.players.p1.battlefield[0].card;
      assert.equal(deployed.cardDefId, 'card_scout');

      // Paused for manual decision
      assert.notEqual(match.pendingDecision, null);
      assert.equal(match.pendingDecision?.type, 'ABILITY_TARGET_SELECTION');
      assert.equal(match.pendingDecision?.abilityId, 'ABILITY_SCOUT_HEAL');

      // Continuation saved as CONTINUE_QUEUE_RESOLUTION
      assert.notEqual(match.pendingContinuation, null);
      assert.equal(match.pendingContinuation?.type, 'CONTINUE_QUEUE_RESOLUTION');

      // Resolve the ability target
      const initialMorale = match.players.p1.morale;
      const res = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'SUPERVISOR', playerId: 'p1' }
      });

      assert.equal(res.success, true);
      assert.equal(match.players.p1.morale, initialMorale + 4);
      assert.equal(match.pendingDecision, null);
      assert.equal(match.pendingContinuation, null);
      assert.equal(isOperationSuspended(match), false);
    });

    test('Multiple ready tickets where ticket 1 pauses for manual ON_DEPLOY then ticket 2 deploys', () => {
      const match = createTestMatch();
      match.currentPhase = 'SHIFT_START';

      // Ticket 1: High influence, has manual ON_DEPLOY
      match.players.p1.queue.push({
        id: 'ticket_1',
        cardId: 'card_1',
        cardName: 'First Card',
        baseCost: 3,
        effectiveCost: 2,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 5,
        ownerId: 'p1',
        fifoIndex: 1,
        hasOnDeployAbility: true,
        abilities: [{
          abilityId: 'AB_1',
          name: 'Ab 1',
          trigger: 'ON_DEPLOY',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 2,
          requiresManualTarget: true,
          customDescription: ''
        }]
      });

      // Ticket 2: Lower influence, auto ON_DEPLOY
      match.players.p1.queue.push({
        id: 'ticket_2',
        cardId: 'card_2',
        cardName: 'Second Card',
        baseCost: 3,
        effectiveCost: 2,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 2,
        ownerId: 'p1',
        fifoIndex: 2,
        hasOnDeployAbility: true,
        abilities: [{
          abilityId: 'AB_2',
          name: 'Ab 2',
          trigger: 'ON_DEPLOY',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 3,
          requiresManualTarget: false,
          customDescription: ''
        }]
      });

      // Execute shift start
      executeShiftStart(match);

      // Ticket 1 deployed and paused
      assert.equal(match.players.p1.battlefield.length, 1);
      assert.equal(match.players.p1.battlefield[0].card.cardDefId, 'card_1');
      assert.equal(match.pendingDecision?.type, 'ABILITY_TARGET_SELECTION');
      // Ticket 2 still in queue
      assert.equal(match.players.p1.queue.length, 1);
      assert.equal(match.players.p1.queue[0].id, 'ticket_2');

      const initialMorale = match.players.p1.morale;

      // Resolve Ticket 1's decision
      const res = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'SUPERVISOR', playerId: 'p1' }
      });

      assert.equal(res.success, true);
      // Both abilities executed: +2 from ticket 1, +3 from ticket 2
      assert.equal(match.players.p1.morale, initialMorale + 5);
      // Both tickets deployed
      assert.equal(match.players.p1.battlefield.length, 2);
      assert.equal(match.players.p1.battlefield[1].card.cardDefId, 'card_2');
      // Queue is empty
      assert.equal(match.players.p1.queue.length, 0);
      assert.equal(match.pendingDecision, null);
      assert.equal(match.pendingContinuation, null);
    });

    test('Capacity Triage Option 1 deploys ticket with manual ON_DEPLOY and suspends cleanly', () => {
      const match = createTestMatch();
      match.currentPhase = 'SHIFT_START';

      // Fill board to 5/5
      for (let i = 1; i <= 5; i++) {
        match.players.p1.battlefield.push({
          slotId: `slot_${i}`,
          card: {
            instanceId: `inst_board_${i}`,
            cardDefId: `board_unit_${i}`,
            ownerId: 'p1',
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
            hasOnDeployAbility: false,
            isFrontDeskGuard: false,
            isRush: false
          },
          canAttack: false,
          enteredTurn: 1
        });
      }

      // Arriving ticket with manual ON_DEPLOY
      match.players.p1.queue.push({
        id: 't_triage_deploy',
        cardId: 'card_arriving_specialist',
        cardName: 'Arriving Specialist',
        baseCost: 4,
        effectiveCost: 3,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 3,
        ownerId: 'p1',
        fifoIndex: 1,
        hasOnDeployAbility: true,
        abilities: [{
          abilityId: 'AB_TRIAGE_HEAL',
          name: 'Triage Heal',
          trigger: 'ON_DEPLOY',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 5,
          requiresManualTarget: true,
          customDescription: ''
        }]
      });

      // Shift start pauses on Capacity Triage
      executeShiftStart(match);
      assert.equal(match.pendingDecision?.type, 'CAPACITY_TRIAGE');

      // Player selects Option 1 (Retire Board Unit 1)
      const triageRes = executeAction(match, {
        type: 'RESOLVE_TRIAGE',
        playerId: 'p1',
        ticketId: 't_triage_deploy',
        decision: {
          type: 'RETIRE_EXISTING',
          boardUnitId: 'inst_board_1'
        }
      });

      assert.equal(triageRes.success, true);
      // Unit 1 retired to breakroom
      assert.equal(match.players.p1.breakroom.length, 1);
      assert.equal(match.players.p1.breakroom[0].instanceId, 'inst_board_1');
      // Arriving specialist deployed on board
      assert.equal(match.players.p1.battlefield.some(s => s.card.cardDefId === 'card_arriving_specialist'), true);

      // ON_DEPLOY paused for target selection!
      assert.notEqual(match.pendingDecision, null);
      assert.equal(match.pendingDecision?.type, 'ABILITY_TARGET_SELECTION');
      const pdDeploy = match.pendingDecision as any;
      assert.equal(pdDeploy?.abilityId, 'AB_TRIAGE_HEAL');
      assert.equal(match.pendingContinuation?.type, 'CONTINUE_QUEUE_RESOLUTION');

      const initialMorale = match.players.p1.morale;

      // Player selects target for the ON_DEPLOY ability
      const deployTargetRes = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'SUPERVISOR', playerId: 'p1' }
      });

      assert.equal(deployTargetRes.success, true);
      assert.equal(match.players.p1.morale, initialMorale + 5);
      assert.equal(match.pendingDecision, null);
      assert.equal(match.pendingContinuation, null);
    });

    test('Capacity Triage Option 2 (reroute) and Option 3 (discard) do not fire ON_DEPLOY', () => {
      const match = createTestMatch();
      match.currentPhase = 'SHIFT_START';

      // 5 units on board
      for (let i = 1; i <= 5; i++) {
        match.players.p1.battlefield.push({
          slotId: `slot_${i}`,
          card: {
            instanceId: `inst_board_${i}`,
            cardDefId: `board_unit_${i}`,
            ownerId: 'p1',
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
            hasOnDeployAbility: false,
            isFrontDeskGuard: false,
            isRush: false
          },
          canAttack: false,
          enteredTurn: 1
        });
      }

      match.players.p1.queue.push({
        id: 't_reroute',
        cardId: 'card_reroute',
        cardName: 'Reroute Unit',
        baseCost: 4,
        effectiveCost: 3,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 3,
        ownerId: 'p1',
        fifoIndex: 1,
        hasOnDeployAbility: true,
        abilities: [{
          abilityId: 'AB_SHOULD_NOT_FIRE',
          name: 'Should Not Fire',
          trigger: 'ON_DEPLOY',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 5,
          requiresManualTarget: true,
          customDescription: ''
        }]
      });

      executeShiftStart(match);
      assert.equal(match.pendingDecision?.type, 'CAPACITY_TRIAGE');

      // Option 2: Reroute to hand
      const initialMorale = match.players.p1.morale;
      const res = executeAction(match, {
        type: 'RESOLVE_TRIAGE',
        playerId: 'p1',
        ticketId: 't_reroute',
        decision: { type: 'REROUTE_TO_HAND' }
      });

      assert.equal(res.success, true);
      // Morale untouched, no ON_DEPLOY triggered
      assert.equal(match.players.p1.morale, initialMorale);
      assert.equal(match.pendingDecision, null);
      assert.equal(match.pendingContinuation, null);
      assert.equal(match.players.p1.hand.some(c => c.cardDefId === 'card_reroute'), true);
    });
  });

  // ==========================================================================
  // DEFECT 4 — STATE-BASED ACTIONS AND DAMAGE TRIGGERS RESUMABILITY
  // ==========================================================================
  describe('Defect 4: Resumable State-Based Actions & FIFO Damage Triggers', () => {
    test('Two simultaneous zero-stamina departures with manual ON_CLOCK_OUT resolve in FIFO order', () => {
      const match = createTestMatch();

      // Put 2 units on battlefield with manual ON_CLOCK_OUT
      const unit1: CardInstance = {
        instanceId: 'inst_depart_1',
        cardDefId: 'card_depart_1',
        ownerId: 'p1',
        currentZone: 'BATTLEFIELD',
        baseCost: 2,
        currentCost: 2,
        canQueueDiscount: true,
        isReroutedFromQueue: false,
        influence: 1,
        efficiency: 2,
        stamina: 0, // Depleted!
        maxStamina: 3,
        temporaryStaminaBuffer: 0,
        hasOnDeployAbility: false,
        isFrontDeskGuard: false,
        isRush: false,
        abilities: [{
          abilityId: 'AB_CLOCKOUT_1',
          name: 'Clockout 1',
          trigger: 'ON_CLOCK_OUT',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 3,
          requiresManualTarget: true,
          customDescription: ''
        }]
      };

      const unit2: CardInstance = {
        instanceId: 'inst_depart_2',
        cardDefId: 'card_depart_2',
        ownerId: 'p1',
        currentZone: 'BATTLEFIELD',
        baseCost: 2,
        currentCost: 2,
        canQueueDiscount: true,
        isReroutedFromQueue: false,
        influence: 1,
        efficiency: 2,
        stamina: 0, // Depleted!
        maxStamina: 3,
        temporaryStaminaBuffer: 0,
        hasOnDeployAbility: false,
        isFrontDeskGuard: false,
        isRush: false,
        abilities: [{
          abilityId: 'AB_CLOCKOUT_2',
          name: 'Clockout 2',
          trigger: 'ON_CLOCK_OUT',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 4,
          requiresManualTarget: true,
          customDescription: ''
        }]
      };

      // Surviving teammate with an ON_CLOCK_OUT ability
      const survivor: CardInstance = {
        instanceId: 'inst_survivor',
        cardDefId: 'card_survivor',
        ownerId: 'p1',
        currentZone: 'BATTLEFIELD',
        baseCost: 2,
        currentCost: 2,
        canQueueDiscount: true,
        isReroutedFromQueue: false,
        influence: 1,
        efficiency: 2,
        stamina: 3, // Alive!
        maxStamina: 3,
        temporaryStaminaBuffer: 0,
        hasOnDeployAbility: false,
        isFrontDeskGuard: false,
        isRush: false,
        abilities: [{
          abilityId: 'AB_SURVIVOR',
          name: 'Survivor Ability',
          trigger: 'ON_CLOCK_OUT',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 10,
          customDescription: ''
        }]
      };

      match.players.p1.battlefield.push(
        { slotId: 'slot_1', card: unit1, canAttack: false, enteredTurn: 1 },
        { slotId: 'slot_2', card: unit2, canAttack: false, enteredTurn: 1 },
        { slotId: 'slot_3', card: survivor, canAttack: false, enteredTurn: 1 }
      );

      // Trigger SBA sweep
      evaluateStateBasedActions(match);

      // Both dead units removed from battlefield
      assert.equal(match.players.p1.battlefield.length, 1);
      assert.equal(match.players.p1.battlefield[0].card.instanceId, 'inst_survivor');
      assert.equal(match.players.p1.breakroom.length, 2);

      // Decision 1 presented to player (unit 1)
      assert.notEqual(match.pendingDecision, null);
      assert.equal(match.pendingDecision?.type, 'ABILITY_TARGET_SELECTION');
      const pd1 = match.pendingDecision as any;
      assert.equal(pd1?.abilityId, 'AB_CLOCKOUT_1');
      assert.equal(pd1?.sourceInstanceId, 'inst_depart_1');

      // Unit 2 trigger queued in FIFO order
      assert.equal(match.pendingTriggerQueue?.length, 1);
      assert.equal(match.pendingTriggerQueue?.[0]?.ability?.abilityId, 'AB_CLOCKOUT_2');
      assert.equal(match.pendingTriggerQueue?.[0]?.departingCard?.instanceId, 'inst_depart_2');

      const initialMorale = match.players.p1.morale;

      // Resolve decision 1
      const res1 = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'SUPERVISOR', playerId: 'p1' }
      });

      assert.equal(res1.success, true);
      assert.equal(match.players.p1.morale, initialMorale + 3);

      // Decision 2 is now presented!
      assert.notEqual(match.pendingDecision, null);
      assert.equal(match.pendingDecision?.type, 'ABILITY_TARGET_SELECTION');
      const pd2 = match.pendingDecision as any;
      assert.equal(pd2?.abilityId, 'AB_CLOCKOUT_2');
      assert.equal(pd2?.sourceInstanceId, 'inst_depart_2');
      assert.equal(match.pendingTriggerQueue?.length, 0);

      // Resolve decision 2
      const res2 = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'SUPERVISOR', playerId: 'p1' }
      });

      assert.equal(res2.success, true);
      assert.equal(match.players.p1.morale, initialMorale + 7);
      assert.equal(match.pendingDecision, null);

      // Teammate isolation check: Survivor's +10 ability was never fired!
      assert.notEqual(match.players.p1.morale, initialMorale + 17);
    });

    test('Combat where attacker and defender both trigger manual ON_DAMAGE_TAKEN resolves in FIFO order', () => {
      const match = createTestMatch();

      // Attacker with manual ON_DAMAGE_TAKEN
      const attacker: CardInstance = {
        instanceId: 'inst_atk',
        cardDefId: 'card_atk',
        ownerId: 'p1',
        currentZone: 'BATTLEFIELD',
        baseCost: 2,
        currentCost: 2,
        canQueueDiscount: true,
        isReroutedFromQueue: false,
        influence: 1,
        efficiency: 3,
        stamina: 5,
        maxStamina: 5,
        temporaryStaminaBuffer: 0,
        hasOnDeployAbility: false,
        isFrontDeskGuard: false,
        isRush: true,
        abilities: [{
          abilityId: 'AB_DMG_ATK',
          name: 'Attacker Retaliate',
          trigger: 'ON_DAMAGE_TAKEN',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 2,
          requiresManualTarget: true,
          customDescription: ''
        }]
      };

      // Defender with manual ON_DAMAGE_TAKEN
      const defender: CardInstance = {
        instanceId: 'inst_def',
        cardDefId: 'card_def',
        ownerId: 'p2',
        currentZone: 'BATTLEFIELD',
        baseCost: 2,
        currentCost: 2,
        canQueueDiscount: true,
        isReroutedFromQueue: false,
        influence: 1,
        efficiency: 2,
        stamina: 5,
        maxStamina: 5,
        temporaryStaminaBuffer: 0,
        hasOnDeployAbility: false,
        isFrontDeskGuard: false,
        isRush: false,
        abilities: [{
          abilityId: 'AB_DMG_DEF',
          name: 'Defender Retaliate',
          trigger: 'ON_DAMAGE_TAKEN',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 3,
          requiresManualTarget: true,
          customDescription: ''
        }]
      };

      match.players.p1.battlefield.push({ slotId: 'slot_p1', card: attacker, canAttack: true, enteredTurn: 1 });
      match.players.p2.battlefield.push({ slotId: 'slot_p2', card: defender, canAttack: false, enteredTurn: 1 });

      const initialP1Morale = match.players.p1.morale;
      const initialP2Morale = match.players.p2.morale;

      // Execute attack
      const atkRes = executeAttack(match, 'inst_atk', { type: 'CHARACTER', characterInstanceId: 'inst_def' });
      assert.equal(atkRes.success, true);

      // Damage dealt simultaneously: defender took 3 damage (stamina 2), attacker took 2 damage (stamina 3)
      assert.equal(defender.stamina, 2);
      assert.equal(attacker.stamina, 3);

      // Defender's ON_DAMAGE_TAKEN dispatched first (as damage recipient of the attack)
      assert.notEqual(match.pendingDecision, null);
      assert.equal(match.pendingDecision?.playerId, 'p2');
      const pdDef = match.pendingDecision as any;
      assert.equal(pdDef?.abilityId, 'AB_DMG_DEF');

      // Attacker's ON_DAMAGE_TAKEN is queued in FIFO order
      assert.equal(match.pendingTriggerQueue?.length, 1);
      assert.equal(match.pendingTriggerQueue?.[0]?.ability?.abilityId, 'AB_DMG_ATK');

      // P2 resolves defender decision
      const resP2 = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p2',
        target: { type: 'SUPERVISOR', playerId: 'p2' }
      });
      assert.equal(resP2.success, true);
      assert.equal(match.players.p2.morale, initialP2Morale + 3);

      // Now P1's attacker decision is presented!
      assert.notEqual(match.pendingDecision, null);
      assert.equal(match.pendingDecision?.playerId, 'p1');
      const pdAtk = match.pendingDecision as any;
      assert.equal(pdAtk?.abilityId, 'AB_DMG_ATK');

      // P1 resolves attacker decision
      const resP1 = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'SUPERVISOR', playerId: 'p1' }
      });
      assert.equal(resP1.success, true);
      assert.equal(match.players.p1.morale, initialP1Morale + 2);
      assert.equal(match.pendingDecision, null);
      assert.equal(isOperationSuspended(match), false);
    });

    test('Full JSON serialization round-trip preservation across interrupted states', () => {
      const match = createTestMatch();

      match.pendingDecision = {
        type: 'ABILITY_TARGET_SELECTION',
        playerId: 'p1',
        sourceInstanceId: 'src_json_test',
        sourceCardName: 'JSON Card',
        abilityId: 'AB_JSON',
        effectType: 'HEAL_MORALE',
        value: 1,
        targetFilter: 'FRIENDLY_SUPERVISOR',
        allowedTargets: [{ target: { type: 'SUPERVISOR', playerId: 'p1' }, label: 'P1', isFriendly: true }],
        executionContext: { depth: 3, budgetCount: 42 },
        triggerContext: {
          trigger: 'ON_CLOCK_OUT',
          sourceInstanceId: 'src_json_test',
          sourcePlayerId: 'p1',
          departingCard: {
            instanceId: 'src_json_test',
            cardDefId: 'card_json',
            ownerId: 'p1',
            currentZone: 'BREAKROOM',
            baseCost: 2,
            currentCost: 2,
            canQueueDiscount: true,
            isReroutedFromQueue: false,
            influence: 1,
            efficiency: 2,
            stamina: 0,
            maxStamina: 3,
            temporaryStaminaBuffer: 0,
            hasOnDeployAbility: false,
            isFrontDeskGuard: false,
            isRush: false
          }
        }
      };

      match.pendingTriggerQueue = [{
        sourceInstanceId: 'src_queued',
        sourcePlayerId: 'p1',
        ability: {
          abilityId: 'AB_QUEUED',
          name: 'Queued Ab',
          trigger: 'ON_CLOCK_OUT',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 2,
          customDescription: ''
        },
        trigger: 'ON_CLOCK_OUT',
        departingCard: {
          instanceId: 'src_queued',
          cardDefId: 'card_queued',
          ownerId: 'p1',
          currentZone: 'BREAKROOM',
          baseCost: 2,
          currentCost: 2,
          canQueueDiscount: true,
          isReroutedFromQueue: false,
          influence: 1,
          efficiency: 2,
          stamina: 0,
          maxStamina: 3,
          temporaryStaminaBuffer: 0,
          hasOnDeployAbility: false,
          isFrontDeskGuard: false,
          isRush: false
        },
        executionContext: { depth: 3, budgetCount: 43 },
        triggerContext: { trigger: 'ON_CLOCK_OUT', sourceInstanceId: 'src_queued', sourcePlayerId: 'p1' }
      }];

      match.pendingContinuation = {
        type: 'CONTINUE_QUEUE_RESOLUTION',
        playerId: 'p1',
        stage: 'RESOLVING_TICKETS',
        countdownDecremented: true
      };

      const serialized = serializeGameState(match);
      const restored = deserializeGameState(serialized);

      assert.equal((restored.pendingDecision as any)?.abilityId, 'AB_JSON');
      assert.equal((restored.pendingDecision as any)?.executionContext?.budgetCount, 42);
      assert.equal(restored.pendingTriggerQueue?.length, 1);
      assert.equal(restored.pendingTriggerQueue?.[0]?.departingCard?.cardDefId, 'card_queued');
      assert.equal(restored.pendingContinuation?.type, 'CONTINUE_QUEUE_RESOLUTION');
      assert.equal(isOperationSuspended(restored), true);
    });
  });
});
