import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState, type CardDefinition } from '../state.js';
import { executeShiftStart } from '../turn_manager.js';
import { executeAction } from '../actions.js';

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

describe('Capacity Triage retirement lifecycle', () => {
  it('resolves ON_CLOCK_OUT before deploying the arriving queue ticket', () => {
    const state = createInitialGameState({
      matchId: 'triage-retirement-trigger-test',
      p1Deck: deck('p1'),
      p2Deck: deck('p2')
    });
    state.currentPhase = 'SHIFT_START';
    state.players.p1.morale = 20;

    const retiringCard = {
      instanceId: 'retire_me',
      cardDefId: 'retiring_character',
      ownerId: 'p1' as const,
      currentZone: 'BATTLEFIELD' as const,
      baseCost: 2,
      currentCost: 2,
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
      hasTriggeredClockOut: false,
      abilities: [{
        abilityId: 'retire_trigger_heal',
        name: 'Retirement Benefits',
        trigger: 'ON_CLOCK_OUT' as const,
        targetFilter: 'FRIENDLY_SUPERVISOR' as const,
        effectType: 'HEAL_MORALE' as const,
        primaryValue: 2,
        requiresManualTarget: true,
        customDescription: 'Restore 2 Morale when this character clocks out.'
      }]
    };

    state.players.p1.battlefield.push({
      slotId: 'slot_0',
      card: retiringCard,
      canAttack: false,
      enteredTurn: 1
    });
    for (let i = 1; i < 5; i++) {
      state.players.p1.battlefield.push({
        slotId: `slot_${i}`,
        card: {
          ...retiringCard,
          instanceId: `stay_${i}`,
          cardDefId: `staying_character_${i}`,
          hasTriggeredClockOut: false,
          abilities: []
        },
        canAttack: false,
        enteredTurn: 1
      });
    }

    state.players.p1.queue.push({
      id: 'ticket_arriving',
      cardId: 'arriving_character',
      cardName: 'Arriving Character',
      baseCost: 4,
      effectiveCost: 3,
      queuedTurn: 1,
      queueDuration: 1,
      remainingTurns: 1,
      influence: 2,
      ownerId: 'p1',
      fifoIndex: 1
    });

    executeShiftStart(state);
    assert.equal(state.pendingDecision?.type, 'CAPACITY_TRIAGE');
    assert.equal(state.players.p1.battlefield.length, 5);

    const triage = executeAction(state, {
      type: 'RESOLVE_TRIAGE',
      playerId: 'p1',
      ticketId: 'ticket_arriving',
      decision: { type: 'RETIRE_EXISTING', boardUnitId: 'retire_me' }
    });

    assert.equal(triage.success, true);
    assert.equal(state.players.p1.battlefield.length, 4);
    assert.equal(state.players.p1.queue.length, 1, 'arrival ticket must remain queued while retirement trigger is unresolved');
    assert.equal(state.players.p1.battlefield.some(s => s.card.cardDefId === 'arriving_character'), false);
    assert.equal(state.players.p1.breakroom.some(card => card.instanceId === 'retire_me'), true);
    const retirementDecision = state.pendingDecision as any;
    assert.equal(retirementDecision?.type, 'ABILITY_TARGET_SELECTION');
    assert.equal(retirementDecision?.sourceInstanceId, 'retire_me');
    assert.equal(retirementDecision?.abilityId, 'retire_trigger_heal');
    assert.equal(state.pendingContinuation?.type, 'CONTINUE_QUEUE_RESOLUTION');

    const resolveRetirement = executeAction(state, {
      type: 'RESOLVE_ABILITY_TARGET',
      playerId: 'p1',
      target: { type: 'SUPERVISOR', playerId: 'p1' }
    });

    assert.equal(resolveRetirement.success, true);
    assert.equal(state.players.p1.morale, 22);
    assert.equal(state.players.p1.queue.length, 0);
    assert.equal(state.players.p1.battlefield.length, 5);
    assert.equal(state.players.p1.battlefield.some(s => s.card.cardDefId === 'arriving_character'), true);
    assert.equal(state.players.p1.breakroom.find(card => card.instanceId === 'retire_me')?.hasTriggeredClockOut, true);
    assert.equal(state.pendingDecision, null);
    assert.equal(state.pendingContinuation, null);
    assert.equal(state.currentPhase, 'SHIFT_BUDGETING');
  });
});
