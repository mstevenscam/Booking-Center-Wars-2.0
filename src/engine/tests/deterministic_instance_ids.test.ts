import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialGameState,
  type CardDefinition,
  serializeGameState,
  deserializeGameState
} from '../state.js';

function deck(prefix: string): CardDefinition[] {
  return Array.from({ length: 15 }, (_, index) => [0, 1].map(copy => ({
    id: `${prefix}_card_${index}_${copy}`,
    name: `Card ${index} ${copy}`,
    cardType: 'CHARACTER' as const,
    baseCost: 2,
    influence: 1,
    efficiency: 2,
    stamina: 3
  }))).flat();
}

describe('Match-local deterministic card instance IDs', () => {
  it('creates identical instance IDs for identical match inputs regardless of prior match creation', () => {
    const config = { matchId: 'determinism-test', p1Deck: deck('p1'), p2Deck: deck('p2') };
    const first = createInitialGameState(config);
    createInitialGameState({ ...config, matchId: 'unrelated-match' });
    const second = createInitialGameState(config);

    const ids = (state: ReturnType<typeof createInitialGameState>) =>
      [...state.players.p1.deck, ...state.players.p1.hand,
       ...state.players.p2.deck, ...state.players.p2.hand].map(card => card.instanceId);

    assert.deepEqual(ids(first), ids(second));
  });

  it('uses unique IDs across both players and all 60 starting cards', () => {
    const state = createInitialGameState({
      matchId: 'unique-id-test',
      p1Deck: deck('shared'),
      p2Deck: deck('shared')
    });
    const cards = [
      ...state.players.p1.deck, ...state.players.p1.hand,
      ...state.players.p2.deck, ...state.players.p2.hand
    ];
    const ids = cards.map(card => card.instanceId);
    assert.equal(ids.length, 60);
    assert.equal(new Set(ids).size, 60);
  });

  it('preserves deterministic IDs through serialize/deserialize', () => {
    const state = createInitialGameState({
      matchId: 'serialization-id-test',
      p1Deck: deck('p1'),
      p2Deck: deck('p2')
    });
    const restored = deserializeGameState(serializeGameState(state));
    assert.deepEqual(
      restored.players.p1.deck.map(card => card.instanceId),
      state.players.p1.deck.map(card => card.instanceId)
    );
    assert.deepEqual(
      restored.players.p2.hand.map(card => card.instanceId),
      state.players.p2.hand.map(card => card.instanceId)
    );
  });
});
