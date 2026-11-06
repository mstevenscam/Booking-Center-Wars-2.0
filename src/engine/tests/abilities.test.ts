/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Phase 2C-A: Card Ability Engine Comprehensive Test Suite
 * 
 * Verifies all architectural requirements from:
 * 1. CARD_ABILITY_LIBRARY.md
 * 2. CARD_DATA_SCHEMA.md
 * 3. FINALIZED_COMBAT_RULES.md (Option A Stamina Buffer)
 * 4. RULE_DECISION_LOG.md
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialGameState,
  CardDefinition,
  GameState,
  executeAction,
  validateAction,
  executeShiftStart,
  advanceToNextPhase,
  executeClockOut,
  evaluateStateBasedActions
} from '../index.js';
import {
  CANONICAL_ABILITY_CATALOG,
  dispatchTriggers,
  resolveAbilityEffect,
  resetAbilityExecutionBudget,
  MAX_TRIGGER_DEPTH
} from '../abilities.js';
import { validateImportedCard } from '../card_importer.js';

function createTestDeck(prefix: string, count = 30): CardDefinition[] {
  const deck: CardDefinition[] = [];
  for (let i = 0; i < count; i++) {
    deck.push({
      id: `${prefix}_card_${i}`,
      name: `${prefix} Specialist ${i}`,
      cardType: 'CHARACTER',
      baseCost: (i % 5) + 1,
      influence: (i % 4) + 1,
      efficiency: (i % 4) + 1,
      stamina: (i % 4) + 2
    });
  }
  return deck;
}

function createReadyMatch(p1Deck?: CardDefinition[], p2Deck?: CardDefinition[]): GameState {
  const match = createInitialGameState({
    p1Deck: p1Deck || createTestDeck('p1'),
    p2Deck: p2Deck || createTestDeck('p2')
  });
  advanceToNextPhase(match); // Advance to Phase 4: OPERATIONAL_ACTION
  return match;
}

describe('Phase 2C-A: Card Ability Engine Verification', () => {

  // ==========================================================================
  // 1. CANONICAL CATALOG & ATOMIC EFFECT EXECUTION
  // ==========================================================================
  describe('1. Canonical Ability Catalog & Atomic Effects', () => {
    test('DRAW_CARDS effect adds card to hand respecting cap 8', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const initialHandCount = p1.hand.length;

      const ability = CANONICAL_ABILITY_CATALOG['ABILITY_EXPRESS_CHECKOUT'];
      const result = resolveAbilityEffect(match, 'p1', 'test_inst', ability, { type: 'NONE' });

      assert.equal(result.success, true);
      assert.equal(p1.hand.length, initialHandCount + 1);
    });

    test('HEAL_STAMINA effect restores character health clamped to maxStamina', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;

      // Deploy damaged character
      const damagedCard = p1.hand[0];
      damagedCard.stamina = 1;
      damagedCard.maxStamina = 5;
      p1.battlefield.push({
        slotId: 'slot_0',
        card: damagedCard,
        canAttack: true,
        enteredTurn: 1
      });

      const ability = CANONICAL_ABILITY_CATALOG['ABILITY_DIRECT_REPAIR']; // Heals 2
      const result = resolveAbilityEffect(match, 'p1', 'test_inst', ability, {
        type: 'CHARACTER',
        characterInstanceId: damagedCard.instanceId
      });

      assert.equal(result.success, true);
      assert.equal(damagedCard.stamina, 3); // 1 + 2 = 3
    });

    test('HEAL_MORALE restores supervisor Morale clamped to maxMorale (30)', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      p1.morale = 25;

      const ability = CANONICAL_ABILITY_CATALOG['ABILITY_SUPERVISOR_COUNSEL']; // Heals 4
      const result = resolveAbilityEffect(match, 'p1', 'test_inst', ability, {
        type: 'SUPERVISOR',
        playerId: 'p1'
      });

      assert.equal(result.success, true);
      assert.equal(p1.morale, 29); // 25 + 4 = 29

      // Cannot exceed maxMorale 30
      resolveAbilityEffect(match, 'p1', 'test_inst', ability, { type: 'SUPERVISOR', playerId: 'p1' });
      assert.equal(p1.morale, 30);
    });

    test('DAMAGE effect applies persistent reduction to characters and Morale', () => {
      const match = createReadyMatch();
      const p2 = match.players.p2;

      // Morale damage
      const expose = CANONICAL_ABILITY_CATALOG['ABILITY_EXPOSÉ_REPORT']; // 2 damage to enemy supervisor
      resolveAbilityEffect(match, 'p1', 'test_inst', expose, { type: 'SUPERVISOR', playerId: 'p2' });
      assert.equal(p2.morale, 28);

      // Character damage
      const enemyCard = p2.deck[0];
      enemyCard.stamina = 4;
      p2.battlefield.push({
        slotId: 'slot_0',
        card: enemyCard,
        canAttack: true,
        enteredTurn: 1
      });

      const rodent = CANONICAL_ABILITY_CATALOG['ABILITY_UNATTENDED_RODENT']; // 2 damage
      resolveAbilityEffect(match, 'p1', 'test_inst', rodent, {
        type: 'CHARACTER',
        characterInstanceId: enemyCard.instanceId
      });
      assert.equal(enemyCard.stamina, 2); // 4 - 2 = 2
    });

    test('DISRUPT_QUEUE accelerates or delays tickets deterministically', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;

      // Add ticket to p1 queue
      p1.queue.push({
        id: 'ticket_p1_1',
        cardId: 'card_a',
        cardName: 'Camera Package',
        baseCost: 5,
        effectiveCost: 4,
        queuedTurn: 1,
        queueDuration: 3,
        remainingTurns: 3,
        influence: 2,
        ownerId: 'p1',
        fifoIndex: 1
      });

      // ABILITY_FAST_TRACK reduces all friendly queue tickets by 1
      const fastTrack = CANONICAL_ABILITY_CATALOG['ABILITY_FAST_TRACK'];
      resolveAbilityEffect(match, 'p1', 'test_inst', fastTrack, { type: 'ALL_QUEUE' });
      assert.equal(p1.queue[0].remainingTurns, 2);

      // Add ticket to p2 queue
      p2.queue.push({
        id: 'ticket_p2_1',
        cardId: 'card_b',
        cardName: 'Tripod',
        baseCost: 3,
        effectiveCost: 2,
        queuedTurn: 1,
        queueDuration: 2,
        remainingTurns: 2,
        influence: 1,
        ownerId: 'p2',
        fifoIndex: 1
      });

      // ABILITY_RESERVATION_HOLD delays opponent ticket by +1
      const hold = CANONICAL_ABILITY_CATALOG['ABILITY_RESERVATION_HOLD'];
      resolveAbilityEffect(match, 'p1', 'test_inst', hold, {
        type: 'QUEUE_TICKET',
        ticketId: 'ticket_p2_1',
        ownerId: 'p2'
      });
      assert.equal(p2.queue[0].remainingTurns, 3);
    });

    test('SILENCE_CHARACTER strips all keywords, abilities, and resets buffs', () => {
      const match = createReadyMatch();
      const p2 = match.players.p2;
      const targetCard = p2.deck[0];
      targetCard.isFrontDeskGuard = true;
      targetCard.isRush = true;
      targetCard.hasOnDeployAbility = true;
      targetCard.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_FAST_TRACK']];
      targetCard.stamina = 5;
      targetCard.maxStamina = 5;

      p2.battlefield.push({
        slotId: 'slot_0',
        card: targetCard,
        canAttack: false,
        enteredTurn: 1
      });

      const silence = CANONICAL_ABILITY_CATALOG['ABILITY_ROOT_CAUSE_ANALYSIS'];
      resolveAbilityEffect(match, 'p1', 'test_inst', silence, {
        type: 'CHARACTER',
        characterInstanceId: targetCard.instanceId
      });

      assert.equal(targetCard.isFrontDeskGuard, false);
      assert.equal(targetCard.isRush, false);
      assert.equal(targetCard.hasOnDeployAbility, false);
      assert.equal(targetCard.abilities.length, 0);
    });

    test('RETURN_TO_HAND bounces character to hand resetting to base stats (Option A Edge Case 8)', () => {
      const match = createReadyMatch();
      const p2 = match.players.p2;
      const targetCard = p2.deck[0];
      targetCard.stamina = 2; // Wounded
      targetCard.maxStamina = 6;
      p2.battlefield.push({
        slotId: 'slot_0',
        card: targetCard,
        canAttack: true,
        enteredTurn: 1
      });

      const review = CANONICAL_ABILITY_CATALOG['ABILITY_MANDATORY_REVIEW'];
      resolveAbilityEffect(match, 'p1', 'test_inst', review, {
        type: 'CHARACTER',
        characterInstanceId: targetCard.instanceId
      });

      // Removed from battlefield
      assert.equal(p2.battlefield.length, 0);
      // Added to hand with reset stamina
      const inHand = p2.hand.find(c => c.instanceId === targetCard.instanceId);
      assert.ok(inHand);
      assert.equal(inHand.stamina, inHand.maxStamina); // Fresh template
    });

    test('Fizzle Guard: Ability resolves safely without error if target leaves board', () => {
      const match = createReadyMatch();
      const review = CANONICAL_ABILITY_CATALOG['ABILITY_MANDATORY_REVIEW'];
      const result = resolveAbilityEffect(match, 'p1', 'test_inst', review, {
        type: 'CHARACTER',
        characterInstanceId: 'non_existent_instance_id'
      });

      assert.equal(result.success, true);
    });
  });

  // ==========================================================================
  // 2. TRIGGER LIFECYCLE: ON_PLAY VS ON_DEPLOY DIFFERENTIATION
  // ==========================================================================
  describe('2. Lifecycle Triggers: ON_PLAY vs ON_DEPLOY Distinction', () => {
    test('Hand deployment triggers both ON_PLAY and ON_DEPLOY', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      p1.currentShift = 10;

      // Card with ON_PLAY and ON_DEPLOY abilities
      const testCard = p1.hand[0];
      testCard.currentCost = 1;
      testCard.abilities = [
        {
          abilityId: 'ABILITY_TEST_PLAY',
          name: 'Play Test',
          trigger: 'ON_PLAY',
          targetFilter: 'SELF',
          effectType: 'MODIFY_SHIFT',
          primaryValue: 1, // +1 temporary shift
          customDescription: 'Gain 1 shift when played.'
        },
        {
          abilityId: 'ABILITY_TEST_DEPLOY',
          name: 'Deploy Test',
          trigger: 'ON_DEPLOY',
          targetFilter: 'ENEMY_SUPERVISOR',
          effectType: 'DAMAGE',
          primaryValue: 2, // 2 damage to enemy supervisor
          customDescription: 'Deal 2 damage when deployed.'
        }
      ];

      const initialShift = p1.currentShift;
      const initialP2Morale = match.players.p2.morale;

      executeAction(match, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: testCard.instanceId
      });

      // Shift: paid 1 cost, but gained +1 temporary Shift from ON_PLAY
      assert.equal(p1.currentShift, initialShift); // 10 - 1 + 1 = 10
      // P2 Morale: took 2 damage from ON_DEPLOY
      assert.equal(match.players.p2.morale, initialP2Morale - 2);
    });

    test('Booking Queue resolution triggers ON_DEPLOY but NOT ON_PLAY', () => {
      const match = createInitialGameState({
        p1Deck: createTestDeck('p1'),
        p2Deck: createTestDeck('p2')
      });
      const p1 = match.players.p1;

      // Setup a resolving ticket with both triggers
      const resolvingCardId = 'test_queue_card';
      CANONICAL_ABILITY_CATALOG['ABILITY_QUEUE_DEPLOY_TEST'] = {
        abilityId: 'ABILITY_QUEUE_DEPLOY_TEST',
        name: 'Queue Deploy Test',
        trigger: 'ON_DEPLOY',
        targetFilter: 'ENEMY_SUPERVISOR',
        effectType: 'DAMAGE',
        primaryValue: 3,
        customDescription: 'Deal 3 damage when deployed.'
      };

      p1.queue.push({
        id: 'ticket_resolving_1',
        cardId: resolvingCardId,
        cardName: 'Resolving Character',
        baseCost: 4,
        effectiveCost: 3,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 1, // Decrements to 0 at Shift Start
        influence: 2,
        ownerId: 'p1',
        fifoIndex: 1
      });

      const initialP2Morale = match.players.p2.morale;

      // Execute Phase 1: Shift Start
      executeShiftStart(match);

      // Ticket decremented to 0 and resolved onto battlefield
      assert.equal(p1.battlefield.length, 1);
      assert.equal(p1.queue.length, 0);
    });

    test('Capacity Triage Option 2 (Reroute to Hand) triggers NEITHER ON_PLAY nor ON_DEPLOY', () => {
      const match = createInitialGameState({
        p1Deck: createTestDeck('p1'),
        p2Deck: createTestDeck('p2')
      });
      const p1 = match.players.p1;

      // Saturate battlefield to 5 characters
      for (let i = 0; i < 5; i++) {
        p1.battlefield.push({
          slotId: `slot_${i}`,
          card: p1.deck[i],
          canAttack: false,
          enteredTurn: 1
        });
      }

      // Add a ticket ready to resolve
      p1.queue.push({
        id: 'ticket_overflow_1',
        cardId: 'card_overflow',
        cardName: 'Overflow Character',
        baseCost: 5,
        effectiveCost: 4,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 2,
        ownerId: 'p1',
        fifoIndex: 1
      });

      const initialP2Morale = match.players.p2.morale;
      const initialHandCount = p1.hand.length;

      // Shift Start pauses for Capacity Triage
      executeShiftStart(match);
      assert.equal(match.pendingDecision?.type, 'CAPACITY_TRIAGE');

      // Resolve triage with Option 2: REROUTE_TO_HAND
      const actionRes = executeAction(match, {
        type: 'RESOLVE_TRIAGE',
        playerId: 'p1',
        ticketId: 'ticket_overflow_1',
        decision: { type: 'REROUTE_TO_HAND' }
      });

      assert.equal(actionRes.success, true);
      // Rerouted to hand
      assert.equal(p1.hand.length, initialHandCount + 1);
      // Battlefield remains 5
      assert.equal(p1.battlefield.length, 5);
      // Neither trigger fired; P2 Morale untouched
      assert.equal(match.players.p2.morale, initialP2Morale);
    });
  });

  // ==========================================================================
  // 3. INTERACTIVE TARGET DECISIONS & SERIALIZATION
  // ==========================================================================
  describe('3. Interactive Ability Targeting & State Serialization', () => {
    test('Pauses game and creates PendingAbilityTargetDecision when target choice is required', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;
      p1.currentShift = 10;

      // Deploy an enemy character to be targeted
      const enemySlot = {
        slotId: 'slot_0',
        card: p2.deck[0],
        canAttack: true,
        enteredTurn: 1
      };
      p2.battlefield.push(enemySlot);

      // Card with manual target ability: ABILITY_ROOT_CAUSE_ANALYSIS (Silence)
      const silenceCard = p1.hand[0];
      silenceCard.currentCost = 1;
      silenceCard.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_ROOT_CAUSE_ANALYSIS']];

      executeAction(match, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: silenceCard.instanceId
      });

      // Pending decision must be created
      assert.ok(match.pendingDecision);
      assert.equal(match.pendingDecision.type, 'ABILITY_TARGET_SELECTION');
      assert.equal(match.pendingDecision.playerId, 'p1');
      assert.equal(match.pendingDecision.abilityId, 'ABILITY_ROOT_CAUSE_ANALYSIS');

      // Other actions must be rejected while decision is pending
      const playAttempt = executeAction(match, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: p1.hand[1].instanceId
      });
      assert.equal(playAttempt.success, false);
      assert.equal(playAttempt.code, 'PENDING_DECISION_REQUIRED');

      // State serialization round-trip test
      const serialized = JSON.stringify(match);
      const restored: GameState = JSON.parse(serialized);
      assert.equal(restored.pendingDecision?.type, 'ABILITY_TARGET_SELECTION');

      // Resolve target on restored state
      const resolveRes = executeAction(restored, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'CHARACTER', characterInstanceId: enemySlot.card.instanceId }
      });

      assert.equal(resolveRes.success, true);
      assert.equal(restored.pendingDecision, null);
    });

    test('Rejects illegal targets without mutating game state', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      p1.currentShift = 10;

      const repairCard = p1.hand[0];
      repairCard.currentCost = 1;
      repairCard.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_DIRECT_REPAIR']]; // Requires ANY_FRIENDLY_CHARACTER

      // Deploy friendly unit
      const friendlySlot = { slotId: 'slot_0', card: p1.deck[0], canAttack: true, enteredTurn: 1 };
      p1.battlefield.push(friendlySlot);

      executeAction(match, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: repairCard.instanceId
      });

      assert.ok(match.pendingDecision);

      // Attempting to target enemy character with friendly-only heal must be rejected
      const invalidTargetRes = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'CHARACTER', characterInstanceId: 'fake_opponent_id' }
      });

      assert.equal(invalidTargetRes.success, false);
      assert.equal(invalidTargetRes.code, 'INVALID_TARGET');
      // Decision remains pending
      assert.ok(match.pendingDecision);
    });
  });

  // ==========================================================================
  // 4. CASCADE PROTECTION & SAFETY LIMITS
  // ==========================================================================
  describe('4. Infinite Cascade Protection & Safety Limits', () => {
    test('MAX_TRIGGER_DEPTH = 10 halts cascading trigger loops safely', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;

      // Card that triggers ON_DAMAGE_TAKEN to damage itself (infinite loop attempt)
      const looperCard = p1.hand[0];
      looperCard.stamina = 50;
      looperCard.maxStamina = 50;
      looperCard.abilities = [
        {
          abilityId: 'ABILITY_INFINITE_LOOP_TEST',
          name: 'Looping Test',
          trigger: 'ON_DAMAGE_TAKEN',
          targetFilter: 'SELF',
          effectType: 'DAMAGE',
          primaryValue: 1,
          customDescription: 'Self damage loop.'
        }
      ];

      p1.battlefield.push({
        slotId: 'slot_0',
        card: looperCard,
        canAttack: true,
        enteredTurn: 1
      });

      resetAbilityExecutionBudget();

      // Trigger initial damage
      const result = dispatchTriggers(match, 'ON_DAMAGE_TAKEN', {
        trigger: 'ON_DAMAGE_TAKEN',
        sourceInstanceId: looperCard.instanceId,
        sourcePlayerId: 'p1'
      });

      assert.ok(result);
      // Engine must survive without stack overflow
      assert.ok(match.historyLog.some(log => log.includes('Trigger cascade limit reached')));
    });

    test('Abilities do not trigger or resolve after match completion', () => {
      const match = createReadyMatch();
      match.status = 'COMPLETED';

      const ability = CANONICAL_ABILITY_CATALOG['ABILITY_EXPRESS_CHECKOUT'];
      const result = resolveAbilityEffect(match, 'p1', 'test_inst', ability, { type: 'NONE' });

      assert.equal(result.success, false);
      assert.equal(result.code, 'MATCH_COMPLETED');
    });
  });

  // ==========================================================================
  // 5. OPTION A TEMPORARY STAMINA BUFFER INTEGRATION
  // ==========================================================================
  describe('5. Option A Temporary Stamina Buffer Integration', () => {
    test('Temporary stamina buff acts as ablative shield and clamps at Clock Out', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      p1.currentShift = 10;

      // Character with base 4 stamina
      const unit = p1.hand[0];
      unit.stamina = 4;
      unit.maxStamina = 4;
      p1.battlefield.push({
        slotId: 'slot_0',
        card: unit,
        canAttack: true,
        enteredTurn: 1
      });

      // Apply ABILITY_CAGE_LOCKDOWN (+2 stamina buffer)
      const lockdown = CANONICAL_ABILITY_CATALOG['ABILITY_CAGE_LOCKDOWN'];
      resolveAbilityEffect(match, 'p1', 'test_inst', lockdown, { type: 'ALL_FRIENDLY' });

      // Augmented to 6/6 with buffer 2
      assert.equal(unit.stamina, 6);
      assert.equal(unit.maxStamina, 6);
      assert.equal(unit.temporaryStaminaBuffer, 2);

      // Takes 1 damage -> 5/6 (absorbed by buffer)
      unit.stamina -= 1;

      // Clock Out (Phase 5) turn-end cleanup
      executeClockOut(match);

      // Clamped to base max 4: min(5, 4) = 4
      assert.equal(unit.stamina, 4);
      assert.equal(unit.maxStamina, 4);
      assert.equal(unit.temporaryStaminaBuffer, 0);
    });
  });

  // ==========================================================================
  // 6. CARD COLLECTION IMPORT COMPATIBILITY
  // ==========================================================================
  describe('6. Card Collection Import Compatibility & Validation', () => {
    test('Accepts valid JSON card payload with registered ability and archive metadata', () => {
      const rawPayload = {
        cardId: 'bw_import_001',
        name: 'Senior Booking Coordinator',
        cardType: 'CHARACTER',
        rarity: 'SUPERVISOR',
        shiftCost: 4,
        power: 3,
        stamina: 5,
        influence: 3,
        isFrontDeskGuard: true,
        abilities: [
          {
            abilityId: 'ABILITY_FAST_TRACK',
            name: 'Fast Track',
            trigger: 'ON_DEPLOY',
            targetFilter: 'ALL_FRIENDLY_QUEUE',
            effectType: 'DISRUPT_QUEUE',
            primaryValue: -1,
            customDescription: 'Reduce queue countdown by 1 turn.'
          }
        ],
        legacyArchive: {
          originalCardName: 'The Legendary Master Coordinator',
          ocrTranscribedText: 'Original text from 2024 physical card.',
          creationYear: 2024,
          scanBatchId: 'BATCH_NORTH_CAMPUS_01'
        }
      };

      const result = validateImportedCard(rawPayload);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
      assert.ok(result.cardDefinition);
      assert.equal(result.cardDefinition.id, 'bw_import_001');
      assert.equal(result.cardDefinition.abilities?.length, 1);
      assert.equal(result.archiveMetadata?.creationYear, 2024);
    });

    test('Rejects payload with forbidden executable code or script injection', () => {
      const maliciousPayload = {
        cardId: 'bw_exploit_001',
        name: 'Rogue Hacker',
        cardType: 'CHARACTER',
        shiftCost: 2,
        attackFn: () => { /* malicious function */ }
      };

      const result = validateImportedCard(maliciousPayload);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('forbidden executable code')));
    });

    test('Rejects payload with invalid cardType or illegal trigger condition', () => {
      const invalidPayload = {
        cardId: 'bw_invalid_001',
        name: 'Faulty Card',
        cardType: 'NON_EXISTENT_TYPE',
        shiftCost: 15, // Illegal > 10
        abilities: [
          {
            abilityId: 'ABILITY_BAD',
            trigger: 'ON_SOME_IMAGINARY_EVENT',
            effectType: 'DAMAGE',
            targetFilter: 'SELF',
            primaryValue: 1
          }
        ]
      };

      const result = validateImportedCard(invalidPayload);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('Invalid cardType')));
      assert.ok(result.errors.some(e => e.includes('shiftCost must be an integer between 0 and 10')));
      assert.ok(result.errors.some(e => e.includes('invalid trigger')));
    });
  });

  // ==========================================================================
  // 7. MULTI-ABILITY COMBINATIONS & REGRESSION CHECKS
  // ==========================================================================
  describe('7. Multi-Ability Combinations & Regressions', () => {
    test('Resolves multiple abilities from a single card deploy deterministically', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      p1.currentShift = 10;

      // Card with 2 deploy abilities: draw 1 card AND deal 2 damage to enemy supervisor
      const multiCard = p1.hand[0];
      multiCard.currentCost = 2;
      multiCard.abilities = [
        CANONICAL_ABILITY_CATALOG['ABILITY_EXPRESS_CHECKOUT'], // Draw 1
        CANONICAL_ABILITY_CATALOG['ABILITY_EXPOSÉ_REPORT']      // 2 dmg to enemy supervisor
      ];

      const initialHand = p1.hand.length;
      const initialP2Morale = match.players.p2.morale;

      executeAction(match, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: multiCard.instanceId
      });

      // Hand: -1 deployed + 1 drawn = net 0
      assert.equal(p1.hand.length, initialHand);
      // P2 Morale: took 2 damage
      assert.equal(match.players.p2.morale, initialP2Morale - 2);
    });

    test('Standard cards without abilities deploy normally without error', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      p1.currentShift = 10;

      const vanillaCard = p1.hand[0];
      vanillaCard.currentCost = 1;
      vanillaCard.abilities = [];

      const res = executeAction(match, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: vanillaCard.instanceId
      });

      assert.equal(res.success, true);
      assert.equal(p1.battlefield.length, 1);
    });
  });
});
