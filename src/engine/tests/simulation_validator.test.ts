import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateVanillaBudget,
  calculateEffectiveQueueCost,
  evaluateCardBalance,
  evaluateFirstPlayerConfigurations,
  CANONICAL_ARCHETYPES
} from '../balance.ts';

test('Queue discount equation respects 1-shift minimum floor', () => {
  // A 1-cost card delayed 2 turns: 1 - 1.5 = -0.5 -> must clamp to 1
  assert.equal(calculateEffectiveQueueCost(1, 2), 1);
  // A 2-cost card delayed 3 turns: 2 - 2.25 = -0.25 -> must clamp to 1
  assert.equal(calculateEffectiveQueueCost(2, 3), 1);
  // Standard discounts: 6-cost delayed 2 turns -> 4.5 -> 5 cost
  assert.equal(calculateEffectiveQueueCost(6, 2), 5);
});

test('Card balance accurately computes influence tax', () => {
  // Influence 1: no tax. 4-cost with 4/5 stats (9 pts total) -> Balanced
  const admin1 = evaluateCardBalance({ shiftCost: 4, power: 4, stamina: 5, influence: 1 });
  assert.equal(admin1.isBalanced, true);
  assert.equal(admin1.breakdown.influenceTax, 0);

  // Influence 3: Tax = (3 - 1) * 1.5 = 3 pts. 4-cost (budget 9) with 3/3 stats + 3 tax = 9 pts -> Balanced
  const director = evaluateCardBalance({ shiftCost: 4, power: 3, stamina: 3, influence: 3 });
  assert.equal(director.isBalanced, true);
  assert.equal(director.breakdown.influenceTax, 3);
  assert.equal(director.delta, 0);
});

test('Deck archetypes contain exactly 30 cards', () => {
  for (const [key, archetype] of Object.entries(CANONICAL_ARCHETYPES)) {
    const totalCards = Object.values(archetype.costDistribution).reduce((sum, count) => sum + count, 0);
    assert.equal(totalCards, 30, `Archetype ${key} must have exactly 30 cards`);
  }
});

test('First-player simulation evaluates Config D as provisional baseline and rejects Config A', () => {
  const configs = evaluateFirstPlayerConfigurations();
  const configD = configs.find(c => c.config.includes('Config D'));
  assert.ok(configD);
  assert.equal(configD.recommendation, 'PROVISIONAL_BASELINE');
  assert.ok(Math.abs(configD.p1AdvantageScore) < 1.0, 'Config D advantage score in tempo model is near zero');

  const configA = configs.find(c => c.config.includes('Config A'));
  assert.ok(configA);
  assert.equal(configA.recommendation, 'REJECTED');
});
