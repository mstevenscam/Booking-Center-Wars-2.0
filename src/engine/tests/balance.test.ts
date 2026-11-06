import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVanillaBudget, calculateEffectiveQueueCost, evaluateCardBalance } from '../balance.ts';

test('calculateVanillaBudget returns correct baseline for turns 1 through 10', () => {
  assert.equal(calculateVanillaBudget(1), 3);   // 1-cost -> 3 stats (e.g. 2/1 or 1/2)
  assert.equal(calculateVanillaBudget(2), 5);   // 2-cost -> 5 stats (e.g. 3/2 or 2/3)
  assert.equal(calculateVanillaBudget(3), 7);   // 3-cost -> 7 stats (e.g. 3/4 or 4/3)
  assert.equal(calculateVanillaBudget(4), 9);   // 4-cost -> 9 stats (e.g. 4/5)
  assert.equal(calculateVanillaBudget(5), 11);  // 5-cost -> 11 stats
  assert.equal(calculateVanillaBudget(10), 21); // 10-cost -> 21 stats
});

test('calculateEffectiveQueueCost applies correct time-delay discount', () => {
  assert.equal(calculateEffectiveQueueCost(6, 2), 5);
  assert.equal(calculateEffectiveQueueCost(8, 3), 6);
});

test('evaluateCardBalance correctly recognizes balanced and over-budget cards', () => {
  // Balanced 2-cost 2/3 vanilla
  const vanillaTwoDrop = evaluateCardBalance({ shiftCost: 2, power: 2, stamina: 3, influence: 1 });
  assert.equal(vanillaTwoDrop.isBalanced, true);
  assert.equal(vanillaTwoDrop.delta, 0);

  // Balanced 3-cost with Front Desk Guard: 2/4 stats (6 stats + 1 taunt tax = 7)
  const tauntThreeDrop = evaluateCardBalance({ 
    shiftCost: 3, 
    power: 2, 
    stamina: 4, 
    influence: 1, 
    hasFrontDeskGuard: true 
  });
  assert.equal(tauntThreeDrop.isBalanced, true);
  assert.equal(tauntThreeDrop.delta, 0);

  // Broken card: 2-cost 4/4 with Rush (allocates 8 + 1.5 = 9.5 vs 5 expected)
  const brokenCard = evaluateCardBalance({ 
    shiftCost: 2, 
    power: 4, 
    stamina: 4, 
    influence: 1, 
    hasRush: true 
  });
  assert.equal(brokenCard.isBalanced, false);
  assert.ok(brokenCard.delta > 3);
});
