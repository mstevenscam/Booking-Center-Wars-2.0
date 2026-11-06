import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState, type CardDefinition } from '../state.js';
import { advanceToNextPhase, executeShiftStart } from '../turn_manager.js';
import { executeAction } from '../actions.js';
import { isOperationSuspended } from '../state.js';

function deck(prefix: string): CardDefinition[] {
  return Array.from({ length: 30 }, (_, i) => ({
    id: `${prefix}_${i}`,
    name: `${prefix} ${i}`,
    cardType: 'CHARACTER' as const,
    baseCost: 1,
    influence: 1,
    efficiency: 1,
    stamina: 2
  }));
}

describe('Canonical Shift Start ordering', () => {
  it('resolves queue arrivals and their ON_DEPLOY decisions before START_OF_SHIFT decisions', () => {
    const state = createInitialGameState({
      matchId: 'shift-start-order-test',
      p1Deck: deck('p1'),
      p2Deck: deck('p2')
    });
    state.currentPhase = 'SHIFT_START';
    state.players.p1.morale = 20;

    const queueAbility = {
      abilityId: 'queued_arrival_heal',
      name: 'Arrival Briefing',
      trigger: 'ON_DEPLOY' as const,
      targetFilter: 'FRIENDLY_SUPERVISOR' as const,
      effectType: 'HEAL_MORALE' as const,
      primaryValue: 3,
      requiresManualTarget: true,
      customDescription: 'Restore 3 Morale on arrival.'
    };
    const startAbility = {
      abilityId: 'morning_standup',
      name: 'Morning Standup',
      trigger: 'START_OF_SHIFT' as const,
      targetFilter: 'FRIENDLY_SUPERVISOR' as const,
      effectType: 'HEAL_MORALE' as const,
      primaryValue: 2,
      requiresManualTarget: true,
      customDescription: 'Restore 2 Morale at Shift Start.'
    };

    state.players.p1.battlefield.push({
      slotId: 'slot_0',
      card: {
        instanceId: 'existing_start_trigger',
        cardDefId: 'existing_start_trigger',
        ownerId: 'p1',
        currentZone: 'BATTLEFIELD',
        baseCost: 1,
        currentCost: 1,
        canQueueDiscount: true,
        isReroutedFromQueue: false,
        influence: 1,
        efficiency: 1,
        stamina: 2,
        maxStamina: 2,
        temporaryStaminaBuffer: 0,
        hasOnDeployAbility: false,
        isFrontDeskGuard: false,
        isRush: false,
        isFirstResponder: false,
        isInfiltration: false,
        abilities: [startAbility]
      },
      canAttack: false,
      enteredTurn: 1
    });

    state.players.p1.queue.push({
      id: 'ticket_arrival_first',
      cardId: 'queued_arrival',
      cardName: 'Queued Arrival',
      baseCost: 3,
      effectiveCost: 2,
      queuedTurn: 1,
      queueDuration: 1,
      remainingTurns: 1,
      influence: 2,
      ownerId: 'p1',
      fifoIndex: 1,
      hasOnDeployAbility: true,
      abilities: [queueAbility]
    });

    executeShiftStart(state);

    const arrival = state.players.p1.battlefield.find(s => s.card.cardDefId === 'queued_arrival')?.card;
    assert.ok(arrival, 'queue arrival should deploy before START_OF_SHIFT triggers');
    assert.equal(state.pendingDecision?.type, 'ABILITY_TARGET_SELECTION');
    if (state.pendingDecision?.type !== 'ABILITY_TARGET_SELECTION') throw new Error('Expected ON_DEPLOY target decision');
    assert.equal(state.pendingDecision.sourceInstanceId, arrival.instanceId);
    assert.equal(state.pendingDecision.abilityId, 'queued_arrival_heal');
    assert.equal(state.pendingContinuation?.type, 'CONTINUE_QUEUE_RESOLUTION');

    const resolveArrival = executeAction(state, {
      type: 'RESOLVE_ABILITY_TARGET',
      playerId: 'p1',
      target: { type: 'SUPERVISOR', playerId: 'p1' }
    });
    assert.equal(resolveArrival.success, true);
    assert.equal(state.players.p1.morale, 23);
    assert.equal(state.pendingDecision?.type, 'ABILITY_TARGET_SELECTION');
    if (state.pendingDecision?.type !== 'ABILITY_TARGET_SELECTION') throw new Error('Expected START_OF_SHIFT target decision');
    assert.equal(state.pendingDecision.sourceInstanceId, 'existing_start_trigger');
    assert.equal(state.pendingDecision.abilityId, 'morning_standup');
    assert.equal(state.pendingContinuation?.type, 'CONTINUE_SHIFT_START');

    const resolveStart = executeAction(state, {
      type: 'RESOLVE_ABILITY_TARGET',
      playerId: 'p1',
      target: { type: 'SUPERVISOR', playerId: 'p1' }
    });
    assert.equal(resolveStart.success, true);
    assert.equal(state.players.p1.morale, 25);
    assert.equal(state.pendingDecision, null);
    assert.equal(state.pendingContinuation, null);
    assert.equal(isOperationSuspended(state), false);
    assert.equal(state.currentPhase, 'SHIFT_BUDGETING');
    assert.equal(state.players.p1.queue.length, 0);
    assert.equal(state.players.p1.battlefield.filter(s => s.card.cardDefId === 'queued_arrival').length, 1);
  });

  it('does not decrement queue countdown a second time when resuming a queued ON_DEPLOY decision', () => {
    const state = createInitialGameState({
      matchId: 'shift-start-countdown-once-test',
      p1Deck: deck('p1'),
      p2Deck: deck('p2')
    });
    state.currentPhase = 'SHIFT_START';
    state.players.p1.queue.push(
      {
        id: 'ticket_resolving',
        cardId: 'queued_manual_arrival',
        cardName: 'Queued Manual Arrival',
        baseCost: 2,
        effectiveCost: 1,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 1,
        influence: 2,
        ownerId: 'p1',
        fifoIndex: 1,
        hasOnDeployAbility: true,
        abilities: [{
          abilityId: 'queued_manual',
          name: 'Queued Manual',
          trigger: 'ON_DEPLOY',
          targetFilter: 'FRIENDLY_SUPERVISOR',
          effectType: 'HEAL_MORALE',
          primaryValue: 1,
          requiresManualTarget: true,
          customDescription: ''
        }]
      },
      {
        id: 'ticket_waiting',
        cardId: 'queued_waiting',
        cardName: 'Queued Waiting',
        baseCost: 3,
        effectiveCost: 2,
        queuedTurn: 1,
        queueDuration: 3,
        remainingTurns: 3,
        influence: 1,
        ownerId: 'p1',
        fifoIndex: 2
      }
    );

    executeShiftStart(state);
    assert.equal(state.players.p1.queue.length, 1);
    assert.equal(state.players.p1.queue[0].id, 'ticket_waiting');
    assert.equal(state.players.p1.queue[0].remainingTurns, 2);
    assert.equal(state.pendingDecision?.type, 'ABILITY_TARGET_SELECTION');

    const result = executeAction(state, {
      type: 'RESOLVE_ABILITY_TARGET',
      playerId: 'p1',
      target: { type: 'SUPERVISOR', playerId: 'p1' }
    });
    assert.equal(result.success, true);
    assert.equal(state.players.p1.queue.length, 1);
    assert.equal(state.players.p1.queue[0].remainingTurns, 2, 'resumption must not decrement the remaining ticket again');
    assert.equal(state.pendingDecision, null);
    assert.equal(state.pendingContinuation, null);
    assert.equal(state.currentPhase, 'SHIFT_BUDGETING');

    const advance = advanceToNextPhase(state);
    assert.equal(advance.success, true);
    assert.equal(state.currentPhase, 'OPERATIONAL_ACTION');
    assert.equal(state.players.p1.queue[0].remainingTurns, 2, 'phase advancement must not rerun Shift Start');
  });
});
