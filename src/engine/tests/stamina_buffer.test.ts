import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCharacterStamina,
  getEffectiveMaxStamina,
  getBaseEffectiveMaxStamina,
  applyTemporaryStaminaBuff,
  applyPermanentStaminaModifier,
  applyDamage,
  applyHealing,
  expireTemporaryBuffs,
  transformCharacter,
  returnToHand
} from '../stamina_buffer.js';

test('Temporary Stamina Buffer (Option A) — 10 Canonical Edge Cases', async (t) => {
  // Edge Case 1: Multiple temporary Stamina buffs stack additively
  await t.test('1. Multiple temporary Stamina buffs stack additively', () => {
    let char = createCharacterStamina(4); // 4/4
    assert.equal(getEffectiveMaxStamina(char), 4);
    assert.equal(char.currentStamina, 4);

    // Buff 1: +2 stamina
    char = applyTemporaryStaminaBuff(char, { id: 'b1', amount: 2, source: 'Coffee Run', durationTurns: 1, currentTurn: 1 });
    assert.equal(getEffectiveMaxStamina(char), 6);
    assert.equal(char.currentStamina, 6);

    // Buff 2: +3 stamina
    char = applyTemporaryStaminaBuff(char, { id: 'b2', amount: 3, source: 'Overtime Adrenaline', durationTurns: 1, currentTurn: 1 });
    assert.equal(getEffectiveMaxStamina(char), 9);
    assert.equal(char.currentStamina, 9);
  });

  // Edge Case 2: Buffs expiring at different times (staggered expiration)
  await t.test('2. Staggered buff expirations clamp correctly at each turn end', () => {
    let char = createCharacterStamina(5); // 5/5
    // Buff A: +2 for 1 turn (expires turn 1)
    char = applyTemporaryStaminaBuff(char, { id: 'bA', amount: 2, source: 'Quick Pep', durationTurns: 1, currentTurn: 1 });
    // Buff B: +4 for 2 turns (expires turn 2)
    char = applyTemporaryStaminaBuff(char, { id: 'bB', amount: 4, source: 'Supervisor Shield', durationTurns: 2, currentTurn: 1 });

    assert.equal(getEffectiveMaxStamina(char), 11);
    assert.equal(char.currentStamina, 11);

    // End of Turn 1: Buff A expires, Buff B remains
    char = expireTemporaryBuffs(char, 1);
    assert.equal(getEffectiveMaxStamina(char), 9); // 5 base + 4 from Buff B
    assert.equal(char.currentStamina, 9);

    // End of Turn 2: Buff B expires
    char = expireTemporaryBuffs(char, 2);
    assert.equal(getEffectiveMaxStamina(char), 5); // 5 base
    assert.equal(char.currentStamina, 5);
  });

  // Edge Case 3: Permanent Stamina increases while temporarily buffed
  await t.test('3. Permanent stamina modifier increases base max and persists after temp buff expires', () => {
    let char = createCharacterStamina(4); // 4 base
    // Temp buff +3
    char = applyTemporaryStaminaBuff(char, { id: 'b1', amount: 3, source: 'Energy Drink', durationTurns: 1, currentTurn: 1 });
    assert.equal(getEffectiveMaxStamina(char), 7);
    assert.equal(char.currentStamina, 7);

    // Apply permanent Gear: +2 Stamina
    char = applyPermanentStaminaModifier(char, 2);
    assert.equal(getBaseEffectiveMaxStamina(char), 6); // 4 base + 2 perm
    assert.equal(getEffectiveMaxStamina(char), 9); // 6 perm + 3 temp
    assert.equal(char.currentStamina, 9);

    // End of turn: temp buff expires
    char = expireTemporaryBuffs(char, 1);
    assert.equal(getEffectiveMaxStamina(char), 6);
    assert.equal(char.currentStamina, 6); // Retains permanent +2!
  });

  // Edge Case 4: Healing while temporarily buffed can heal up to augmented max, then clamps
  await t.test('4. Healing while temporarily buffed restores up to augmented max, clamped at turn end', () => {
    let char = createCharacterStamina(5);
    // Takes 3 damage down to 2/5
    char = applyDamage(char, 3);
    assert.equal(char.currentStamina, 2);

    // Receives temporary +4 buff -> current 6, max 9
    char = applyTemporaryStaminaBuff(char, { id: 'b1', amount: 4, source: 'First Aid Kit', durationTurns: 1, currentTurn: 1 });
    assert.equal(char.currentStamina, 6);
    assert.equal(getEffectiveMaxStamina(char), 9);

    // Heal for 2 -> current becomes 8/9
    char = applyHealing(char, 2);
    assert.equal(char.currentStamina, 8);

    // End of turn: temp buff (+4) expires, base max is 5.
    // Current 8 is clamped down to 5. Character is fully healed to 5/5!
    char = expireTemporaryBuffs(char, 1);
    assert.equal(getEffectiveMaxStamina(char), 5);
    assert.equal(char.currentStamina, 5);
  });

  // Edge Case 5: Damage during temporary buffs acts as an ablative buffer
  await t.test('5. Damage subtracts from temporary buffer first, protecting base stamina', () => {
    let char = createCharacterStamina(4); // 4/4
    // +3 temporary stamina buffer -> 7/7
    char = applyTemporaryStaminaBuff(char, { id: 'b1', amount: 3, source: 'Kevlar Vest', durationTurns: 1, currentTurn: 1 });
    assert.equal(char.currentStamina, 7);

    // Takes 2 damage -> 5/7 (2 of the 3 temp stamina absorbed)
    char = applyDamage(char, 2);
    assert.equal(char.currentStamina, 5);

    // Turn ends: buff expires, max reverts to 4. Current (5) clamps to 4.
    // The base 4 stamina was completely unscathed!
    char = expireTemporaryBuffs(char, 1);
    assert.equal(getEffectiveMaxStamina(char), 4);
    assert.equal(char.currentStamina, 4);

    // Now test taking damage greater than the buffer:
    let char2 = createCharacterStamina(4); // 4/4
    char2 = applyTemporaryStaminaBuff(char2, { id: 'b2', amount: 2, source: 'Hard Hat', durationTurns: 1, currentTurn: 1 }); // 6/6
    char2 = applyDamage(char2, 5); // Takes 5 damage -> 1/6 left
    assert.equal(char2.currentStamina, 1);

    // Turn ends: buff expires, max reverts to 4. Current 1 is <= 4, so remains 1/4.
    char2 = expireTemporaryBuffs(char2, 1);
    assert.equal(getEffectiveMaxStamina(char2), 4);
    assert.equal(char2.currentStamina, 1);
  });

  // Edge Case 6: Temporary Stamina debuff lowers max and current, expires back up
  await t.test('6. Temporary stamina debuff reduces current stamina and returns on expiration', () => {
    let char = createCharacterStamina(6); // 6/6
    // Debuff -2 until end of turn (Flu Outbreak)
    char = applyTemporaryStaminaBuff(char, { id: 'd1', amount: -2, source: 'Flu Outbreak', durationTurns: 1, currentTurn: 1 });
    assert.equal(getEffectiveMaxStamina(char), 4);
    assert.equal(char.currentStamina, 4);

    // Takes 1 damage -> 3/4
    char = applyDamage(char, 1);
    assert.equal(char.currentStamina, 3);

    // Turn ends: debuff expires, max returns to 6. Current remains 3/6.
    char = expireTemporaryBuffs(char, 1);
    assert.equal(getEffectiveMaxStamina(char), 6);
    assert.equal(char.currentStamina, 3);
  });

  // Edge Case 7: Transformations wipe all temporary buffs and reset to new template
  await t.test('7. Transformation clears all temporary buffs and sets fresh stats', () => {
    let char = createCharacterStamina(6);
    char = applyTemporaryStaminaBuff(char, { id: 'b1', amount: 4, source: 'Hype', durationTurns: 1, currentTurn: 1 });
    assert.equal(getEffectiveMaxStamina(char), 10);

    // Transformed into "Demoted Intern" (1/1)
    const transformed = transformCharacter(1);
    assert.equal(getEffectiveMaxStamina(transformed), 1);
    assert.equal(transformed.currentStamina, 1);
    assert.equal(transformed.temporaryBuffs.length, 0);
  });

  // Edge Case 8: Returning to Hand clears all temporary buffs and resets to original card stats
  await t.test('8. Returning to hand resets character to card template', () => {
    let char = createCharacterStamina(5);
    char = applyTemporaryStaminaBuff(char, { id: 'b1', amount: 3, source: 'Bonus', durationTurns: 1, currentTurn: 1 });
    char = applyDamage(char, 4); // Down to 4/8
    assert.equal(char.currentStamina, 4);

    // Bounced to hand
    const bounced = returnToHand(5);
    assert.equal(getEffectiveMaxStamina(bounced), 5);
    assert.equal(bounced.currentStamina, 5);
    assert.equal(bounced.temporaryBuffs.length, 0);
  });

  // Edge Case 9: Re-summoning after returning to hand enters fresh with base card stamina
  await t.test('9. Re-summoning deploys fresh state without residual buffs or damage', () => {
    const cardTemplateStamina = 5;
    const freshSummon = createCharacterStamina(cardTemplateStamina);
    assert.equal(getEffectiveMaxStamina(freshSummon), 5);
    assert.equal(freshSummon.currentStamina, 5);
    assert.equal(freshSummon.temporaryBuffs.length, 0);
  });

  // Edge Case 10: Simultaneous combat damage and buff expiration sequencing
  await t.test('10. Combat damage resolves strictly during Combat phase; buff expiration occurs in End-of-Shift', () => {
    let char = createCharacterStamina(3); // 3/3
    // +2 temporary buff -> 5/5
    char = applyTemporaryStaminaBuff(char, { id: 'b1', amount: 2, source: 'Temporary Adrenaline', durationTurns: 1, currentTurn: 1 });

    // In Combat Phase: Takes 4 damage (fatal if base 3, but buffered to 5)
    char = applyDamage(char, 4);
    assert.equal(char.currentStamina, 1); // Survives combat with 1 stamina!
    assert(char.currentStamina > 0, 'Character survives combat phase');

    // In End of Shift Phase: Buff expires, base max 3. Current 1 is <= 3, remains 1/3.
    char = expireTemporaryBuffs(char, 1);
    assert.equal(getEffectiveMaxStamina(char), 3);
    assert.equal(char.currentStamina, 1);
    assert(char.currentStamina > 0, 'Character survives turn transition');
  });
});
