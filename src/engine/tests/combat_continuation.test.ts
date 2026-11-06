import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState, instantiateCard, type CardDefinition } from '../state.js';
import { executeAction } from '../actions.js';
import { executeAttack } from '../combat.js';
import { isOperationSuspended } from '../state.js';

function makeDeck(prefix: string): CardDefinition[] {
  return Array.from({ length: 30 }, (_, index) => ({
    id: `${prefix}_${index}`,
    name: `Test ${index}`,
    cardType: 'CHARACTER' as const,
    baseCost: 1,
    influence: 1,
    efficiency: 1,
    stamina: 2
  }));
}

describe('Combat continuation after damage reactions', () => {
  it('resolves both manual damage reactions before clock-out SBAs, without repeating combat damage', () => {
    const state = createInitialGameState({
      matchId: 'combat-continuation-manual-damage',
      p1Deck: makeDeck('p1'),
      p2Deck: makeDeck('p2')
    });
    state.currentPhase = 'OPERATIONAL_ACTION';
    state.players.p1.morale = 20;
    state.players.p2.morale = 20;

    const reaction = (id: string) => ({
      abilityId: id,
      name: id,
      trigger: 'ON_DAMAGE_TAKEN' as const,
      targetFilter: 'FRIENDLY_SUPERVISOR' as const,
      effectType: 'HEAL_MORALE' as const,
      primaryValue: 1,
      requiresManualTarget: true,
      customDescription: 'Restore 1 Morale.'
    });

    const attacker = instantiateCard({
      id: 'attacker',
      name: 'Attacker',
      cardType: 'CHARACTER',
      baseCost: 1,
      influence: 1,
      efficiency: 3,
      stamina: 2,
      abilities: [reaction('attacker_reaction')]
    }, 'p1', 'BATTLEFIELD', 1001);
    const defender = instantiateCard({
      id: 'defender',
      name: 'Defender',
      cardType: 'CHARACTER',
      baseCost: 1,
      influence: 1,
      efficiency: 3,
      stamina: 2,
      abilities: [reaction('defender_reaction')]
    }, 'p2', 'BATTLEFIELD', 1002);

    state.players.p1.battlefield.push({ slotId: 'slot_0', card: attacker, canAttack: true, enteredTurn: 0 });
    state.players.p2.battlefield.push({ slotId: 'slot_0', card: defender, canAttack: false, enteredTurn: 0 });

    const attack = executeAttack(state, attacker.instanceId, {
      type: 'CHARACTER',
      characterInstanceId: defender.instanceId
    });
    assert.equal(attack.success, true);
    assert.equal(attacker.stamina, 0);
    assert.equal(defender.stamina, 0);
    assert.equal(state.pendingDecision?.type, 'ABILITY_TARGET_SELECTION');
    assert.equal(state.pendingContinuation?.type, 'CONTINUE_COMBAT');
    assert.equal(isOperationSuspended(state), true);

    const first = executeAction(state, {
      type: 'RESOLVE_ABILITY_TARGET',
      playerId: 'p2',
      target: { type: 'SUPERVISOR', playerId: 'p2' }
    });
    assert.equal(first.success, true);
    assert.equal(state.players.p2.morale, 21);
    assert.equal(state.pendingDecision?.type, 'ABILITY_TARGET_SELECTION');
    assert.equal(state.pendingDecision?.playerId, 'p1');
    assert.equal(state.players.p1.battlefield.length, 1, 'combat SBA must wait until both simultaneous damage reactions finish');
    assert.equal(state.players.p2.battlefield.length, 1);

    const second = executeAction(state, {
      type: 'RESOLVE_ABILITY_TARGET',
      playerId: 'p1',
      target: { type: 'SUPERVISOR', playerId: 'p1' }
    });
    assert.equal(second.success, true);
    assert.equal(state.players.p1.morale, 21);
    assert.equal(state.players.p1.battlefield.length, 0);
    assert.equal(state.players.p2.battlefield.length, 0);
    assert.equal(state.players.p1.breakroom.some(card => card.instanceId === attacker.instanceId), true);
    assert.equal(state.players.p2.breakroom.some(card => card.instanceId === defender.instanceId), true);
    assert.equal(state.pendingDecision, null);
    assert.equal(state.pendingContinuation, null);
    assert.equal(isOperationSuspended(state), false);
  });
  it('resolves both automatic ON_DAMAGE_TAKEN abilities before simultaneous combat SBA', () => {
    const state = createInitialGameState({
      matchId: 'combat-continuation-automatic-damage',
      p1Deck: makeDeck('p1'),
      p2Deck: makeDeck('p2')
    });
    state.currentPhase = 'OPERATIONAL_ACTION';
    state.players.p1.morale = 20;
    state.players.p2.morale = 20;

    const reaction = (id: string) => ({
      abilityId: id,
      name: id,
      trigger: 'ON_DAMAGE_TAKEN' as const,
      targetFilter: 'FRIENDLY_SUPERVISOR' as const,
      effectType: 'HEAL_MORALE' as const,
      primaryValue: 1,
      requiresManualTarget: false,
      customDescription: 'Restore 1 Morale.'
    });

    const attacker = instantiateCard({
      id: 'automatic_attacker',
      name: 'Automatic Attacker',
      cardType: 'CHARACTER',
      baseCost: 1,
      influence: 1,
      efficiency: 3,
      stamina: 2,
      abilities: [reaction('automatic_attacker_reaction')]
    }, 'p1', 'BATTLEFIELD', 2001);
    const defender = instantiateCard({
      id: 'automatic_defender',
      name: 'Automatic Defender',
      cardType: 'CHARACTER',
      baseCost: 1,
      influence: 1,
      efficiency: 3,
      stamina: 2,
      abilities: [reaction('automatic_defender_reaction')]
    }, 'p2', 'BATTLEFIELD', 2002);

    state.players.p1.battlefield.push({ slotId: 'slot_0', card: attacker, canAttack: true, enteredTurn: 0 });
    state.players.p2.battlefield.push({ slotId: 'slot_0', card: defender, canAttack: false, enteredTurn: 0 });

    const result = executeAttack(state, attacker.instanceId, {
      type: 'CHARACTER',
      characterInstanceId: defender.instanceId
    });

    assert.equal(result.success, true);
    assert.equal(state.players.p1.morale, 21, 'attacker reaction must resolve before SBA removes it');
    assert.equal(state.players.p2.morale, 21, 'defender reaction must resolve before SBA removes it');
    assert.equal(state.players.p1.battlefield.length, 0);
    assert.equal(state.players.p2.battlefield.length, 0);
    assert.equal(state.players.p1.breakroom.some(card => card.instanceId === attacker.instanceId), true);
    assert.equal(state.players.p2.breakroom.some(card => card.instanceId === defender.instanceId), true);
    assert.equal(state.pendingContinuation, null);
    assert.equal(state.pendingDecision, null);
  });

});
