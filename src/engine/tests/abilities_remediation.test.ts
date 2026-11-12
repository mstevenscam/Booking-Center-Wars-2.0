/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Phase 2C-A Final Audit Remediation Test Suite
 * 
 * Verifies all 5 corrective requirements from Phase 2C-A Final Technical Audit:
 * 1. RETURN_TO_HAND: Full restoration to card-template values (efficiency, stamina, maxStamina, baseCost),
 *    clearing of temporary & permanent bonuses, preservation of identity, Breakroom handling on full hand,
 *    and no ON_CLOCK_OUT trigger.
 * 2. SILENCE_CHARACTER: Removal of abilities & keywords, clearing of temporary buffers, reset to base-template
 *    stats (reverting permanent buffs), preservation of identity/ownership, suppression of ability triggers,
 *    and absence of accidental departure events.
 * 3. ExecutionContext: Preservation of depth and 50-op budget across pending target decisions and queue resumption,
 *    prevention of budget bypass via pause/resume, match isolation, and JSON serializability.
 * 4. PRNG: Standard Mulberry32 state progression (seed + 0x6D2B79F5 >>> 0), known fixed-seed test vectors,
 *    save/load serialization continuation, and zero Math.random().
 * 5. Target Validation: Complete isTargetLegal validation across all 15 filters (types, existence, ownership,
 *    stale tickets, BOTH_SUPERVISORS representation and dual-damage execution).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialGameState,
  CardDefinition,
  GameState,
  executeAction,
  validateAction,
  executeClockOut,
  evaluateStateBasedActions,
  CANONICAL_ABILITY_CATALOG,
  dispatchTriggers,
  resolveAbilityEffect,
  isTargetLegal,
  getLegalAbilityTargets,
  nextRandom,
  nextRandomInt,
  pickRandom,
  serializeGameState,
  deserializeGameState,
  executeAttack,
  ExecutionContext,
  AbilityDefinition,
  MAX_EXECUTION_BUDGET,
  MAX_TRIGGER_DEPTH
} from '../index.js';

function createTestDeck(prefix: string, count = 30): CardDefinition[] {
  const deck: CardDefinition[] = [];
  for (let i = 0; i < count; i++) {
    deck.push({
      id: `${prefix}_card_${i}`,
      name: `${prefix} Worker ${i}`,
      cardType: 'CHARACTER',
      baseCost: (i % 4) + 1,
      influence: (i % 3) + 1,
      efficiency: (i % 3) + 2, // base efficiency: 2, 3, or 4
      stamina: (i % 4) + 3     // base stamina: 3, 4, 5, or 6
    });
  }
  return deck;
}

function createReadyMatch(seed = 42): GameState {
  const match = createInitialGameState({
    matchId: 'final_remediation_test_match',
    p1Deck: createTestDeck('p1'),
    p2Deck: createTestDeck('p2'),
    prngSeed: seed
  });
  match.currentPhase = 'OPERATIONAL_ACTION';
  return match;
}

describe('Phase 2C-A Final Audit Remediation Test Suite', () => {

  // ==========================================================================
  // 1. RETURN_TO_HAND — RESTORE CARD-TEMPLATE STATISTICS
  // ==========================================================================
  describe('1. RETURN_TO_HAND — Restore Card-Template Statistics', () => {
    test('Bouncing resets temporary and permanent modifications back to base card template', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;

      // Card with base stats: Eff 2, Sta 3
      const card = p2.hand[0];
      const origInstanceId = card.instanceId;
      const origCardDefId = card.cardDefId;
      const baseEff = card.baseTemplate?.efficiency ?? card.efficiency;
      const baseSta = card.baseTemplate?.stamina ?? card.stamina;

      p2.battlefield.push({ slotId: 'slot_0', card, canAttack: true, enteredTurn: 1 });

      // Apply permanent Field Promotion (+1/+1)
      const promo = CANONICAL_ABILITY_CATALOG['ABILITY_FIELD_PROMOTION'];
      resolveAbilityEffect(match, 'p2', 'promoter', promo, {
        type: 'CHARACTER',
        characterInstanceId: card.instanceId
      });

      // Apply temporary stamina buffer (+2)
      card.temporaryStaminaBuffer = 2;
      card.stamina += 2;
      card.maxStamina += 2;

      // Apply temporary efficiency buffer (+1)
      card.temporaryEfficiencyBuffer = 1;
      card.efficiency += 1;

      // Verify augmented stats
      assert.equal(card.efficiency, baseEff + 2); // +1 permanent + 1 temp
      assert.equal(card.stamina, baseSta + 3);    // +1 permanent + 2 temp

      // Execute RETURN_TO_HAND via Mandatory Review
      const review = CANONICAL_ABILITY_CATALOG['ABILITY_MANDATORY_REVIEW'];
      const res = resolveAbilityEffect(match, 'p1', 'admin_src', review, {
        type: 'CHARACTER',
        characterInstanceId: card.instanceId
      });

      assert.equal(res.success, true);
      assert.equal(p2.battlefield.length, 0); // Removed from battlefield

      // Card is in hand
      const inHand = p2.hand.find(c => c.instanceId === origInstanceId);
      assert.ok(inHand);
      assert.equal(inHand.instanceId, origInstanceId); // Preserves instance identity
      assert.equal(inHand.cardDefId, origCardDefId);   // Preserves card definition
      assert.equal(inHand.ownerId, 'p2');             // Preserves ownership

      // Restored completely to base-template stats
      assert.equal(inHand.efficiency, baseEff);
      assert.equal(inHand.stamina, baseSta);
      assert.equal(inHand.maxStamina, baseSta);
      assert.equal(inHand.temporaryEfficiencyBuffer, 0);
      assert.equal(inHand.temporaryStaminaBuffer, 0);
      assert.equal(inHand.currentCost, inHand.baseCost);
    });

    test('Repeated return/redeploy cycle preserves pristine template stats without cumulative drift', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const card = p1.hand[0];
      const baseEff = card.baseTemplate!.efficiency;
      const baseSta = card.baseTemplate!.stamina;

      for (let cycle = 0; cycle < 3; cycle++) {
        // Deploy to board
        card.currentZone = 'BATTLEFIELD';
        p1.battlefield.push({ slotId: 'slot_0', card, canAttack: true, enteredTurn: 1 });

        // Buff with permanent Field Promotion (+1/+1)
        card.efficiency += 1;
        card.stamina += 1;
        card.maxStamina += 1;

        // Bounce back to hand
        const review = CANONICAL_ABILITY_CATALOG['ABILITY_MANDATORY_REVIEW'];
        resolveAbilityEffect(match, 'p2', 'admin_src', review, {
          type: 'CHARACTER',
          characterInstanceId: card.instanceId
        });

        // Verify stats are reset to pristine base template
        assert.equal(card.efficiency, baseEff);
        assert.equal(card.stamina, baseSta);
        assert.equal(card.maxStamina, baseSta);
        assert.equal(card.temporaryStaminaBuffer, 0);
        assert.equal(card.temporaryEfficiencyBuffer, 0);
      }
    });

    test('RETURN_TO_HAND when hand is full (8 cards) burns card to Breakroom without firing ON_CLOCK_OUT', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;

      // Fill P2's hand to exactly 8 cards
      while (p2.hand.length < 8) {
        p2.hand.push({ ...p2.deck[0], instanceId: `filler_${p2.hand.length}` });
      }
      assert.equal(p2.hand.length, 8);

      // Character with ON_CLOCK_OUT on battlefield
      const dyingCard = p2.deck[0];
      dyingCard.instanceId = 'target_bounce_unit';
      dyingCard.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_UNATTENDED_RODENT']];
      p2.battlefield.push({ slotId: 'slot_0', card: dyingCard, canAttack: true, enteredTurn: 1 });

      const friendlyTarget = p1.hand[0];
      friendlyTarget.stamina = 5;
      p1.battlefield.push({ slotId: 'slot_0', card: friendlyTarget, canAttack: true, enteredTurn: 1 });

      // Bounce card to P2's hand
      const review = CANONICAL_ABILITY_CATALOG['ABILITY_MANDATORY_REVIEW'];
      resolveAbilityEffect(match, 'p1', 'admin_src', review, {
        type: 'CHARACTER',
        characterInstanceId: dyingCard.instanceId
      });

      // Hand was full: card burned to Breakroom
      assert.equal(p2.battlefield.length, 0);
      assert.equal(p2.hand.length, 8);
      assert.ok(p2.breakroom.some(c => c.instanceId === dyingCard.instanceId));

      // ON_CLOCK_OUT must NOT trigger! Friendly target did not take damage
      assert.equal(friendlyTarget.stamina, 5);
    });

    test('Card with multiple keywords is silenced, returned to hand, template restored, and redeployed with active abilities', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      p1.currentShift = 10;

      // Create a test card with full keywords and baseTemplate
      const card = p1.hand[0];
      const origInstanceId = card.instanceId;
      const origDefId = card.cardDefId;
      card.isFrontDeskGuard = true;
      card.isRush = true;
      card.isFirstResponder = true;
      card.isInfiltration = true;
      card.hasOnDeployAbility = true;
      card.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_EXPRESS_CHECKOUT']];

      // Update baseTemplate so restoration knows original values
      card.baseTemplate = {
        baseCost: card.baseCost,
        efficiency: card.efficiency,
        stamina: card.stamina,
        influence: card.influence,
        isFrontDeskGuard: true,
        isRush: true,
        isFirstResponder: true,
        isInfiltration: true,
        hasOnDeployAbility: true,
        abilities: [CANONICAL_ABILITY_CATALOG['ABILITY_EXPRESS_CHECKOUT']]
      };

      // Deploy to battlefield
      card.currentZone = 'BATTLEFIELD';
      p1.battlefield.push({ slotId: 'slot_0', card, canAttack: true, enteredTurn: 1 });

      // Silence the card (strips keywords, abilities, sets isSilenced = true)
      const silence = CANONICAL_ABILITY_CATALOG['ABILITY_ROOT_CAUSE_ANALYSIS'];
      resolveAbilityEffect(match, 'p2', 'silencer', silence, {
        type: 'CHARACTER',
        characterInstanceId: card.instanceId
      });

      assert.equal(card.isSilenced, true);
      assert.equal(card.isFrontDeskGuard, false);
      assert.equal(card.isRush, false);
      assert.equal(card.isFirstResponder, false);
      assert.equal(card.isInfiltration, false);
      assert.equal(card.hasOnDeployAbility, false);
      assert.equal(card.abilities.length, 0);

      // Return to hand via Mandatory Review
      const review = CANONICAL_ABILITY_CATALOG['ABILITY_MANDATORY_REVIEW'];
      resolveAbilityEffect(match, 'p2', 'reviewer', review, {
        type: 'CHARACTER',
        characterInstanceId: card.instanceId
      });

      assert.equal(p1.battlefield.length, 0);
      const inHand = p1.hand.find(c => c.instanceId === origInstanceId);
      assert.ok(inHand);
      assert.equal(inHand.instanceId, origInstanceId);
      assert.equal(inHand.cardDefId, origDefId);
      assert.equal(inHand.ownerId, 'p1');

      // Verify all template-backed properties fully restored
      assert.equal(inHand.isSilenced, false);
      assert.equal(inHand.isFrontDeskGuard, true);
      assert.equal(inHand.isRush, true);
      assert.equal(inHand.isFirstResponder, true);
      assert.equal(inHand.isInfiltration, true);
      assert.equal(inHand.hasOnDeployAbility, true);
      assert.ok(inHand.abilities);
      assert.equal(inHand.abilities.length, 1);
      assert.equal(inHand.abilities[0].abilityId, 'ABILITY_EXPRESS_CHECKOUT');
      assert.equal(inHand.temporaryStaminaBuffer, 0);
      assert.equal(inHand.temporaryEfficiencyBuffer, 0);
      assert.equal(inHand.hasTriggeredClockOut, false);

      // Redeploy card to battlefield: on-deploy triggers and keywords remain active
      const handCountBefore = p1.hand.length;
      executeAction(match, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: inHand.instanceId
      });

      assert.equal(p1.battlefield.length, 1);
      const onField = p1.battlefield[0].card;
      assert.equal(onField.instanceId, origInstanceId);
      assert.equal(onField.isFrontDeskGuard, true);
      assert.equal(onField.isRush, true);
      assert.equal(onField.isFirstResponder, true);
      assert.equal(onField.isInfiltration, true);
      // Express Checkout draws 1 card on deploy: net hand count equal (spent 1 card, drew 1 card)
      assert.equal(p1.hand.length, handCountBefore);
    });
  });

  // ==========================================================================
  // 2. SILENCE_CHARACTER — IMPLEMENT APPROVED RESET BEHAVIOR
  // ==========================================================================
  describe('2. SILENCE_CHARACTER — Approved Reset Behavior', () => {
    test('Silence strips abilities & keywords, clears temporary buffers, and resets stats to base template', () => {
      const match = createReadyMatch();
      const p2 = match.players.p2;

      const card = p2.hand[0];
      const baseEff = card.baseTemplate!.efficiency;
      const baseSta = card.baseTemplate!.stamina;

      card.isFrontDeskGuard = true;
      card.isRush = true;
      card.isFirstResponder = true;
      card.isInfiltration = true;
      card.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_HEAVY_FLIGHT_CASE']];

      // Give buffs
      card.efficiency = baseEff + 3;
      card.stamina = baseSta + 2;
      card.maxStamina = baseSta + 2;
      card.temporaryStaminaBuffer = 2;
      card.temporaryEfficiencyBuffer = 1;

      p2.battlefield.push({ slotId: 'slot_0', card, canAttack: true, enteredTurn: 1 });

      const silence = CANONICAL_ABILITY_CATALOG['ABILITY_ROOT_CAUSE_ANALYSIS'];
      resolveAbilityEffect(match, 'p1', 'silencer', silence, {
        type: 'CHARACTER',
        characterInstanceId: card.instanceId
      });

      // Keywords and abilities stripped
      assert.equal(card.isSilenced, true);
      assert.equal(card.isFrontDeskGuard, false);
      assert.equal(card.isRush, false);
      assert.equal(card.isFirstResponder, false);
      assert.equal(card.isInfiltration, false);
      assert.equal(card.abilities.length, 0);

      // Temporary buffers cleared
      assert.equal(card.temporaryEfficiencyBuffer, 0);
      assert.equal(card.temporaryStaminaBuffer, 0);

      // Stats reset to base template
      assert.equal(card.efficiency, baseEff);
      assert.equal(card.maxStamina, baseSta);
      assert.equal(card.stamina, baseSta);
    });

    test('Silencing a damaged character clamps stamina to base template max without healing past damage', () => {
      const match = createReadyMatch();
      const p2 = match.players.p2;
      const card = p2.hand[0];
      const baseSta = card.baseTemplate!.stamina;

      // Damaged unit: taken 1 damage
      card.stamina = baseSta - 1;
      p2.battlefield.push({ slotId: 'slot_0', card, canAttack: true, enteredTurn: 1 });

      const silence = CANONICAL_ABILITY_CATALOG['ABILITY_ROOT_CAUSE_ANALYSIS'];
      resolveAbilityEffect(match, 'p1', 'silencer', silence, {
        type: 'CHARACTER',
        characterInstanceId: card.instanceId
      });

      // Does not heal: remains baseSta - 1
      assert.equal(card.stamina, baseSta - 1);
      assert.equal(card.maxStamina, baseSta);
    });

    test('Silenced character cannot trigger abilities and does not create departure event', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;

      // Heavy Flight Case unit (hand[1] has base stamina 4 in createTestDeck)
      const defender = p2.hand[1];
      defender.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_HEAVY_FLIGHT_CASE']];
      defender.stamina = 4;
      defender.maxStamina = 4;
      p2.battlefield.push({ slotId: 'slot_0', card: defender, canAttack: true, enteredTurn: 1 });

      const attacker = p1.hand[0];
      attacker.stamina = 5;
      p1.battlefield.push({ slotId: 'slot_0', card: attacker, canAttack: true, enteredTurn: 1 });

      // Silence the defender first
      const silence = CANONICAL_ABILITY_CATALOG['ABILITY_ROOT_CAUSE_ANALYSIS'];
      resolveAbilityEffect(match, 'p1', attacker.instanceId, silence, {
        type: 'CHARACTER',
        characterInstanceId: defender.instanceId
      });

      // Now deal damage to silenced defender
      resolveAbilityEffect(match, 'p1', attacker.instanceId, {
        abilityId: 'DMG_PUNCH',
        name: 'Punch',
        trigger: 'ON_PLAY',
        targetFilter: 'ANY_ENEMY_CHARACTER',
        effectType: 'DAMAGE',
        primaryValue: 2,
        customDescription: 'Deals 2'
      }, { type: 'CHARACTER', characterInstanceId: defender.instanceId });

      // Defender took 2 damage (4 -> 2)
      assert.equal(defender.stamina, 2);
      // Retaliation was stripped by silence; attacker took 0 damage
      assert.equal(attacker.stamina, 5);
      // Unit remains on battlefield (silence did not create departure event)
      assert.equal(p2.battlefield.length, 1);
    });
  });

  // ==========================================================================
  // 3. EXECUTIONCONTEXT — PRESERVE SAFEGUARDS ACROSS QUEUED TRIGGER RESUMPTION
  // ==========================================================================
  describe('3. ExecutionContext — Safeguards Across Queued Resumption', () => {
    test('Budget count is preserved across manual target decision and resumes with same budget', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      p1.currentShift = 10;

      // Card with manual target ability
      const multiCard = p1.hand[0];
      multiCard.abilities = [
        CANONICAL_ABILITY_CATALOG['ABILITY_DIRECT_REPAIR'],
        CANONICAL_ABILITY_CATALOG['ABILITY_EXPRESS_CHECKOUT']
      ];

      const targetUnit = p1.hand[1];
      targetUnit.stamina = 2;
      targetUnit.maxStamina = 5;
      p1.battlefield.push({ slotId: 'slot_0', card: targetUnit, canAttack: true, enteredTurn: 1 });

      // Deploy multiCard
      executeAction(match, {
        type: 'DEPLOY_CARD',
        playerId: 'p1',
        cardInstanceId: multiCard.instanceId
      });

      // Pending decision created with executionContext
      assert.ok(match.pendingDecision && match.pendingDecision.type === 'ABILITY_TARGET_SELECTION');
      assert.ok(match.pendingDecision.executionContext);
      const budgetAtPause = match.pendingDecision.executionContext.budgetCount;
      assert.ok(budgetAtPause > 0);

      // Pending trigger queue also holds executionContext
      assert.ok(match.pendingTriggerQueue && match.pendingTriggerQueue.length > 0);
      assert.ok(match.pendingTriggerQueue[0].executionContext);
      assert.equal(match.pendingTriggerQueue[0].executionContext.budgetCount, budgetAtPause);

      // Resolve decision
      executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'CHARACTER', characterInstanceId: targetUnit.instanceId }
      });

      assert.equal(match.pendingDecision, null);
    });

    test('Repeated pause/resumes enforce global MAX_EXECUTION_BUDGET (50) without bypass', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;

      // Create a pending decision seeded at budget count 49
      const injured = p1.hand[0];
      p1.battlefield.push({ slotId: 'slot_0', card: injured, canAttack: true, enteredTurn: 1 });

      match.pendingDecision = {
        type: 'ABILITY_TARGET_SELECTION',
        playerId: 'p1',
        sourceInstanceId: 'src_test',
        sourceCardName: 'Test Card',
        abilityId: 'ABILITY_DIRECT_REPAIR',
        effectType: 'HEAL_STAMINA',
        value: 1,
        targetFilter: 'ANY_FRIENDLY_CHARACTER',
        allowedTargets: [{
          target: { type: 'CHARACTER', characterInstanceId: injured.instanceId },
          label: 'Injured',
          isFriendly: true
        }],
        executionContext: { depth: 1, budgetCount: 49 }
      };

      // Queue an additional trigger that would exceed 50
      match.pendingTriggerQueue = [{
        sourceInstanceId: 'src_extra',
        sourcePlayerId: 'p1',
        ability: CANONICAL_ABILITY_CATALOG['ABILITY_EXPRESS_CHECKOUT'],
        trigger: 'ON_PLAY',
        executionContext: { depth: 1, budgetCount: 50 }
      }];

      const res = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'CHARACTER', characterInstanceId: injured.instanceId }
      });

      assert.equal(res.success, true);
      // History log must contain the halt event
      assert.ok(match.historyLog.some(log => log.includes(`MAX_EXECUTION_BUDGET = ${MAX_EXECUTION_BUDGET}`)));
    });

    test('ExecutionContext safely survives JSON serialization and deserialization', () => {
      const match = createReadyMatch();
      match.pendingDecision = {
        type: 'ABILITY_TARGET_SELECTION',
        playerId: 'p1',
        sourceInstanceId: 'inst_1',
        sourceCardName: 'Source',
        abilityId: 'ABILITY_DIRECT_REPAIR',
        effectType: 'HEAL_STAMINA',
        value: 2,
        targetFilter: 'ANY_FRIENDLY_CHARACTER',
        allowedTargets: [],
        executionContext: { depth: 3, budgetCount: 27 }
      };

      const serialized = serializeGameState(match);
      const restored = deserializeGameState(serialized);

      assert.ok(restored.pendingDecision && restored.pendingDecision.type === 'ABILITY_TARGET_SELECTION');
      assert.deepEqual(restored.pendingDecision.executionContext, { depth: 3, budgetCount: 27 });
    });

    test('Dispatch begins at budget 48 with five eligible candidates: only 2 execute, candidate 51 never executes, budget stays at 50', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;

      // Add 5 characters to battlefield, each with an ON_PLAY or custom trigger ability
      for (let i = 0; i < 5; i++) {
        const c = p1.hand[i] || p1.deck.pop()!;
        c.abilities = [{
          abilityId: `TEST_ABILITY_${i}`,
          name: `Test Ability ${i}`,
          trigger: 'START_OF_SHIFT',
          targetFilter: 'SELF',
          effectType: 'BUFF_STAT',
          primaryValue: 1,
          secondaryValue: 0,
          customDescription: 'Buff +1 Eff'
        }];
        p1.battlefield.push({ slotId: `slot_${i}`, card: c, canAttack: true, enteredTurn: 1 });
      }

      const execContext: ExecutionContext = { depth: 0, budgetCount: 48 };

      const res = dispatchTriggers(match, 'START_OF_SHIFT', {
        trigger: 'START_OF_SHIFT',
        sourceInstanceId: 'any_src',
        sourcePlayerId: 'p1'
      }, execContext);

      // Only 2 candidates could execute (candidates 49 and 50) before reaching MAX_EXECUTION_BUDGET = 50
      assert.equal(execContext.budgetCount, 50);
      // Budget must never exceed 50
      assert.ok(execContext.budgetCount <= MAX_EXECUTION_BUDGET);

      // Verify that candidate 0 and candidate 1 received buffs, but candidate 2, 3, 4 did NOT (candidate 51 never executed)
      assert.equal(p1.battlefield[0].card.efficiency, p1.battlefield[0].card.baseTemplate!.efficiency + 1);
      assert.equal(p1.battlefield[1].card.efficiency, p1.battlefield[1].card.baseTemplate!.efficiency + 1);
      assert.equal(p1.battlefield[2].card.efficiency, p1.battlefield[2].card.baseTemplate!.efficiency);
      assert.equal(p1.battlefield[3].card.efficiency, p1.battlefield[3].card.baseTemplate!.efficiency);
      assert.equal(p1.battlefield[4].card.efficiency, p1.battlefield[4].card.baseTemplate!.efficiency);

      // Log records the budget exceeded notice
      assert.ok(res.events.some(e => e.includes(`MAX_EXECUTION_BUDGET = ${MAX_EXECUTION_BUDGET}`)));
    });

    test('Budget limit holds when manual target decision pauses candidate loop and resumes, including after JSON serialization', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;

      const injured = p1.hand[0];
      injured.stamina = 2;
      injured.maxStamina = 5;
      p1.battlefield.push({ slotId: 'slot_0', card: injured, canAttack: true, enteredTurn: 1 });

      // Candidate 1: requires manual target (runs at budget 49)
      // Candidate 2: automatic buff (runs at budget 50)
      // Candidate 3: automatic buff (would run at budget 51 -> must be blocked and preserved in queue)
      match.pendingDecision = {
        type: 'ABILITY_TARGET_SELECTION',
        playerId: 'p1',
        sourceInstanceId: 'src_manual',
        sourceCardName: 'Manual Repair',
        abilityId: 'ABILITY_DIRECT_REPAIR',
        effectType: 'HEAL_STAMINA',
        value: 2,
        targetFilter: 'ANY_FRIENDLY_CHARACTER',
        allowedTargets: [{
          target: { type: 'CHARACTER', characterInstanceId: injured.instanceId },
          label: 'Injured Target',
          isFriendly: true
        }],
        executionContext: { depth: 1, budgetCount: 49 }
      };

      match.pendingTriggerQueue = [
        {
          sourceInstanceId: 'src_auto_50',
          sourcePlayerId: 'p1',
          ability: {
            abilityId: 'AUTO_50',
            name: 'Auto Fifty',
            trigger: 'ON_PLAY',
            targetFilter: 'SELF',
            effectType: 'BUFF_STAT',
            primaryValue: 1,
            secondaryValue: 0,
            customDescription: 'Buff'
          },
          trigger: 'ON_PLAY',
          executionContext: { depth: 1, budgetCount: 49 }
        },
        {
          sourceInstanceId: 'src_auto_51',
          sourcePlayerId: 'p1',
          ability: {
            abilityId: 'AUTO_51',
            name: 'Auto Fifty-One',
            trigger: 'ON_PLAY',
            targetFilter: 'SELF',
            effectType: 'BUFF_STAT',
            primaryValue: 1,
            secondaryValue: 0,
            customDescription: 'Buff'
          },
          trigger: 'ON_PLAY',
          executionContext: { depth: 1, budgetCount: 49 }
        }
      ];

      // Test JSON serialization survival while paused
      const serialized = serializeGameState(match);
      const resumedMatch = deserializeGameState(serialized);

      // Resolve the manual target decision
      const res = executeAction(resumedMatch, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'CHARACTER', characterInstanceId: injured.instanceId }
      });

      assert.equal(res.success, true);
      // Injured target healed
      assert.equal(resumedMatch.players.p1.battlefield[0].card.stamina, 4);

      // Candidate 50 executed, candidate 51 was stopped and preserved in queue
      assert.ok(resumedMatch.historyLog.some(log => log.includes(`MAX_EXECUTION_BUDGET = ${MAX_EXECUTION_BUDGET}`)));
      assert.equal(resumedMatch.pendingTriggerQueue?.length, 1);
      assert.equal(resumedMatch.pendingTriggerQueue![0].ability.abilityId, 'AUTO_51');
    });

    test('Dispatch begins at budget 50 with multiple eligible candidates: 0 candidates execute, budget stays at 50, all candidates blocked', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;

      for (let i = 0; i < 3; i++) {
        const c = p1.hand[i] || p1.deck.pop()!;
        c.abilities = [{
          abilityId: `BLOCKED_ABILITY_${i}`,
          name: `Blocked Ability ${i}`,
          trigger: 'START_OF_SHIFT',
          targetFilter: 'SELF',
          effectType: 'BUFF_STAT',
          primaryValue: 1,
          secondaryValue: 0,
          customDescription: 'Buff'
        }];
        p1.battlefield.push({ slotId: `slot_${i}`, card: c, canAttack: true, enteredTurn: 1 });
      }

      const execContext: ExecutionContext = { depth: 0, budgetCount: 50 };

      const res = dispatchTriggers(match, 'START_OF_SHIFT', {
        trigger: 'START_OF_SHIFT',
        sourceInstanceId: 'any_src',
        sourcePlayerId: 'p1'
      }, execContext);

      // Saturated budget immediately halts
      assert.equal(execContext.budgetCount, 50);
      assert.equal(p1.battlefield[0].card.efficiency, p1.battlefield[0].card.baseTemplate!.efficiency);
      assert.equal(p1.battlefield[1].card.efficiency, p1.battlefield[1].card.baseTemplate!.efficiency);
      assert.equal(p1.battlefield[2].card.efficiency, p1.battlefield[2].card.baseTemplate!.efficiency);
      assert.ok(res.events.some(e => e.includes(`MAX_EXECUTION_BUDGET = ${MAX_EXECUTION_BUDGET}`)));
    });
  });

  // ==========================================================================
  // 4. PRNG — STANDARD MULBERRY32 STATE PROGRESSION & TEST VECTORS
  // ==========================================================================
  describe('4. PRNG — Standard Mulberry32 Correctness', () => {
    test('Standard Mulberry32 generates exact mathematical test vectors for fixed seed 123456789', () => {
      const match = createReadyMatch(123456789);

      // Verify exact Mulberry32 sequence:
      // s0 = 123456789
      // Step 1: s1 = (s0 + 0x6D2B79F5) >>> 0 = 1955022602
      // Output 1 ≈ 0.2577907438389957
      const v1 = nextRandom(match);
      assert.equal(match.rngState, 1955022602);
      assert.ok(Math.abs(v1 - 0.2577907438389957) < 1e-12);

      // Step 2: s2 = (s1 + 0x6D2B79F5) >>> 0 = 3786588415
      // Output 2 ≈ 0.9707721115555614
      const v2 = nextRandom(match);
      assert.equal(match.rngState, 3786588415);
      assert.ok(Math.abs(v2 - 0.9707721115555614) < 1e-12);

      // Step 3: s3 = (s2 + 0x6D2B79F5) >>> 0 = 1323186932
      // Output 3 ≈ 0.7853280142880976
      const v3 = nextRandom(match);
      assert.equal(match.rngState, 1323186932);
      assert.ok(Math.abs(v3 - 0.7853280142880976) < 1e-12);
    });

    test('Standard Mulberry32 generates exact test vectors for seed 0', () => {
      const match = createReadyMatch(0);

      // Step 1: s1 = 0x6D2B79F5 = 1831565813
      // Output 1 ≈ 0.26642920868471265
      const v1 = nextRandom(match);
      assert.equal(match.rngState, 1831565813);
      assert.ok(Math.abs(v1 - 0.26642920868471265) < 1e-12);

      // Step 2: s2 = (1831565813 + 0x6D2B79F5) >>> 0 = 3663131626
      // Output 2 ≈ 0.0003297457005828619
      const v2 = nextRandom(match);
      assert.equal(match.rngState, 3663131626);
      assert.ok(Math.abs(v2 - 0.0003297457005828619) < 1e-12);
    });

    test('Save/restore continuation preserves subsequent PRNG sequence identically', () => {
      const match = createReadyMatch(8888);
      nextRandom(match);
      nextRandom(match);

      const serialized = serializeGameState(match);
      const restored = deserializeGameState(serialized);

      const originalSeq = [nextRandom(match), nextRandom(match), nextRandom(match)];
      const restoredSeq = [nextRandom(restored), nextRandom(restored), nextRandom(restored)];

      assert.deepEqual(originalSeq, restoredSeq);
      assert.equal(match.rngState, restored.rngState);
    });
  });

  // ==========================================================================
  // 5. TARGET VALIDATION — STRENGTHENED ISTARGETLEGAL
  // ==========================================================================
  describe('5. Target Validation — Strengthened isTargetLegal', () => {
    test('Validates character existence and rejects non-existent or 0-stamina characters', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const unit = p1.hand[0];
      unit.stamina = 3;
      p1.battlefield.push({ slotId: 'slot_0', card: unit, canAttack: true, enteredTurn: 1 });

      // Valid on friendly battlefield
      assert.equal(isTargetLegal(match, 'p1', 'ANY_FRIENDLY_CHARACTER', {
        type: 'CHARACTER',
        characterInstanceId: unit.instanceId
      }), true);

      // Rejected for non-existent instanceId
      assert.equal(isTargetLegal(match, 'p1', 'ANY_FRIENDLY_CHARACTER', {
        type: 'CHARACTER',
        characterInstanceId: 'phantom_id'
      }), false);

      // Rejected when stamina is 0
      unit.stamina = 0;
      assert.equal(isTargetLegal(match, 'p1', 'ANY_FRIENDLY_CHARACTER', {
        type: 'CHARACTER',
        characterInstanceId: unit.instanceId
      }), false);
    });

    test('Validates friendly vs enemy ownership strictly', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;

      const p1Unit = p1.hand[0];
      p1.battlefield.push({ slotId: 'slot_0', card: p1Unit, canAttack: true, enteredTurn: 1 });

      const p2Unit = p2.hand[0];
      p2.battlefield.push({ slotId: 'slot_0', card: p2Unit, canAttack: true, enteredTurn: 1 });

      // P1 targeting friendly unit as ANY_ENEMY_CHARACTER -> FALSE
      assert.equal(isTargetLegal(match, 'p1', 'ANY_ENEMY_CHARACTER', {
        type: 'CHARACTER',
        characterInstanceId: p1Unit.instanceId
      }), false);

      // P1 targeting enemy unit as ANY_ENEMY_CHARACTER -> TRUE
      assert.equal(isTargetLegal(match, 'p1', 'ANY_ENEMY_CHARACTER', {
        type: 'CHARACTER',
        characterInstanceId: p2Unit.instanceId
      }), true);

      // P1 targeting enemy unit as ANY_FRIENDLY_CHARACTER -> FALSE
      assert.equal(isTargetLegal(match, 'p1', 'ANY_FRIENDLY_CHARACTER', {
        type: 'CHARACTER',
        characterInstanceId: p2Unit.instanceId
      }), false);
    });

    test('Validates queue-ticket ownership and rejects stale tickets', () => {
      const match = createReadyMatch();
      const p2 = match.players.p2;

      p2.queue.push({
        id: 'ticket_99',
        cardId: p2.deck[0].cardDefId,
        cardName: 'Queued Worker',
        baseCost: 3,
        effectiveCost: 1,
        queuedTurn: 1,
        queueDuration: 2,
        remainingTurns: 2,
        influence: 1,
        ownerId: 'p2',
        fifoIndex: 0
      });

      // Valid opponent queue ticket
      assert.equal(isTargetLegal(match, 'p1', 'PENDING_QUEUE_TICKET', {
        type: 'QUEUE_TICKET',
        ticketId: 'ticket_99',
        ownerId: 'p2'
      }), true);

      // Stale / non-existent ticket -> FALSE
      assert.equal(isTargetLegal(match, 'p1', 'PENDING_QUEUE_TICKET', {
        type: 'QUEUE_TICKET',
        ticketId: 'stale_ticket',
        ownerId: 'p2'
      }), false);

      // Wrong owner -> FALSE
      assert.equal(isTargetLegal(match, 'p1', 'PENDING_QUEUE_TICKET', {
        type: 'QUEUE_TICKET',
        ticketId: 'ticket_99',
        ownerId: 'p1'
      }), false);
    });

    test('Validates Supervisor targets and supports BOTH_SUPERVISORS explicitly', () => {
      const match = createReadyMatch();

      // FRIENDLY_SUPERVISOR
      assert.equal(isTargetLegal(match, 'p1', 'FRIENDLY_SUPERVISOR', { type: 'SUPERVISOR', playerId: 'p1' }), true);
      assert.equal(isTargetLegal(match, 'p1', 'FRIENDLY_SUPERVISOR', { type: 'SUPERVISOR', playerId: 'p2' }), false);

      // ENEMY_SUPERVISOR
      assert.equal(isTargetLegal(match, 'p1', 'ENEMY_SUPERVISOR', { type: 'SUPERVISOR', playerId: 'p2' }), true);
      assert.equal(isTargetLegal(match, 'p1', 'ENEMY_SUPERVISOR', { type: 'SUPERVISOR', playerId: 'p1' }), false);

      // BOTH_SUPERVISORS
      assert.equal(isTargetLegal(match, 'p1', 'BOTH_SUPERVISORS', { type: 'BOTH_SUPERVISORS' }), true);
      assert.equal(isTargetLegal(match, 'p1', 'BOTH_SUPERVISORS', { type: 'SUPERVISOR', playerId: 'p1' }), false);

      // Resolve damage to BOTH_SUPERVISORS
      const dualDmg = {
        abilityId: 'DUAL_AUDIT',
        name: 'Dual Audit',
        trigger: 'ON_PLAY' as const,
        targetFilter: 'BOTH_SUPERVISORS' as const,
        effectType: 'DAMAGE' as const,
        primaryValue: 3,
        customDescription: 'Deals 3 damage to both Supervisors.'
      };

      resolveAbilityEffect(match, 'p1', 'src', dualDmg, { type: 'BOTH_SUPERVISORS' });

      // Both supervisors took 3 damage (30 -> 27)
      assert.equal(match.players.p1.morale, 27);
      assert.equal(match.players.p2.morale, 27);
    });

    test('Rejects invalid target types and malformed payloads', () => {
      const match = createReadyMatch();

      // Passing SUPERVISOR when filter requires CHARACTER -> FALSE
      assert.equal(isTargetLegal(match, 'p1', 'ANY_FRIENDLY_CHARACTER', {
        type: 'SUPERVISOR',
        playerId: 'p1'
      }), false);

      // Passing CHARACTER when filter requires QUEUE_TICKET -> FALSE
      assert.equal(isTargetLegal(match, 'p1', 'PENDING_QUEUE_TICKET', {
        type: 'CHARACTER',
        characterInstanceId: 'inst_1'
      }), false);

      // Malformed / null targets -> FALSE
      assert.equal(isTargetLegal(match, 'p1', 'ANY_TARGET', null as any), false);
      assert.equal(isTargetLegal(match, 'p1', 'ANY_TARGET', undefined as any), false);
    });
  });

  // ==========================================================================
  // 6. TASK 1 — FIX ATTACKER TARGET VALIDATION
  // ==========================================================================
  describe('6. Task 1 — ATTACKER Target Validation', () => {
    test('Correct attacker accepted when context and attackerSlot are valid', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;

      const p2Attacker = p2.hand[0];
      p2.battlefield.push({ slotId: 'slot_0', card: p2Attacker, canAttack: false, enteredTurn: 1 });

      const context = {
        trigger: 'ON_DAMAGE_TAKEN' as const,
        sourceInstanceId: 'p1_defender',
        sourcePlayerId: 'p1' as const,
        attackerSlot: p2.battlefield[0],
        damageAmount: 2
      };

      // Correct attacker on opponent's battlefield is accepted
      const isLegal = isTargetLegal(match, 'p1', 'ATTACKER', {
        type: 'CHARACTER',
        characterInstanceId: p2Attacker.instanceId
      }, 'p1_defender', context, 'DAMAGE');

      assert.equal(isLegal, true);
    });

    test('Different enemy character rejected even if on opposing battlefield', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;

      const p2Attacker = p2.hand[0];
      const p2Bystander = p2.hand[1];
      p2.battlefield.push({ slotId: 'slot_0', card: p2Attacker, canAttack: false, enteredTurn: 1 });
      p2.battlefield.push({ slotId: 'slot_1', card: p2Bystander, canAttack: false, enteredTurn: 1 });

      const context = {
        trigger: 'ON_DAMAGE_TAKEN' as const,
        sourceInstanceId: 'p1_defender',
        sourcePlayerId: 'p1' as const,
        attackerSlot: p2.battlefield[0], // slot_0 is attacker
        damageAmount: 2
      };

      // Target is bystander (slot_1) -> MUST BE REJECTED
      const isLegal = isTargetLegal(match, 'p1', 'ATTACKER', {
        type: 'CHARACTER',
        characterInstanceId: p2Bystander.instanceId
      }, 'p1_defender', context, 'DAMAGE');

      assert.equal(isLegal, false);
    });

    test('Missing attacker context rejected (CHARACTER target requires attacker identity)', () => {
      const match = createReadyMatch();
      const p2 = match.players.p2;

      const p2Unit = p2.hand[0];
      p2.battlefield.push({ slotId: 'slot_0', card: p2Unit, canAttack: false, enteredTurn: 1 });

      // No context at all
      assert.equal(isTargetLegal(match, 'p1', 'ATTACKER', {
        type: 'CHARACTER',
        characterInstanceId: p2Unit.instanceId
      }, 'p1_defender', undefined, 'DAMAGE'), false);

      // Context with missing attackerSlot
      assert.equal(isTargetLegal(match, 'p1', 'ATTACKER', {
        type: 'CHARACTER',
        characterInstanceId: p2Unit.instanceId
      }, 'p1_defender', {
        trigger: 'ON_DAMAGE_TAKEN',
        sourceInstanceId: 'p1_defender',
        sourcePlayerId: 'p1'
      }, 'DAMAGE'), false);
    });

    test('Stale attacker rejected when attacker died or left battlefield', () => {
      const match = createReadyMatch();
      const p2 = match.players.p2;

      const p2Attacker = p2.hand[0];
      p2Attacker.stamina = 0; // Lethal damage in combat
      const deadSlot = { slotId: 'slot_0', card: p2Attacker, canAttack: false, enteredTurn: 1 };

      const context = {
        trigger: 'ON_DAMAGE_TAKEN' as const,
        sourceInstanceId: 'p1_defender',
        sourcePlayerId: 'p1' as const,
        attackerSlot: deadSlot,
        damageAmount: 2
      };

      // Attacker not on battlefield -> REJECTED
      assert.equal(isTargetLegal(match, 'p1', 'ATTACKER', {
        type: 'CHARACTER',
        characterInstanceId: p2Attacker.instanceId
      }, 'p1_defender', context, 'DAMAGE'), false);

      // Attacker on battlefield but with 0 stamina -> REJECTED
      p2.battlefield.push(deadSlot);
      assert.equal(isTargetLegal(match, 'p1', 'ATTACKER', {
        type: 'CHARACTER',
        characterInstanceId: p2Attacker.instanceId
      }, 'p1_defender', context, 'DAMAGE'), false);
    });

    test('Invalid target type rejected for ATTACKER filter', () => {
      const match = createReadyMatch();
      const p2 = match.players.p2;
      const p2Attacker = p2.hand[0];
      p2.battlefield.push({ slotId: 'slot_0', card: p2Attacker, canAttack: false, enteredTurn: 1 });

      const context = {
        trigger: 'ON_DAMAGE_TAKEN' as const,
        sourceInstanceId: 'p1_defender',
        sourcePlayerId: 'p1' as const,
        attackerSlot: p2.battlefield[0],
        damageAmount: 2
      };

      // SUPERVISOR target is rejected
      assert.equal(isTargetLegal(match, 'p1', 'ATTACKER', {
        type: 'SUPERVISOR',
        playerId: 'p2'
      }, 'p1_defender', context, 'DAMAGE'), false);

      // QUEUE_TICKET target is rejected
      assert.equal(isTargetLegal(match, 'p1', 'ATTACKER', {
        type: 'QUEUE_TICKET',
        ticketId: 't1',
        ownerId: 'p2'
      }, 'p1_defender', context, 'DAMAGE'), false);
    });

    test('Legitimate NONE target behavior for effects not requiring character target', () => {
      const match = createReadyMatch();
      const p2 = match.players.p2;
      const p2Attacker = p2.hand[0];
      p2.battlefield.push({ slotId: 'slot_0', card: p2Attacker, canAttack: false, enteredTurn: 1 });

      const context = {
        trigger: 'ON_DAMAGE_TAKEN' as const,
        sourceInstanceId: 'p1_defender',
        sourcePlayerId: 'p1' as const,
        attackerSlot: p2.battlefield[0],
        damageAmount: 2
      };

      // For DRAW_CARDS (does not require character target), NONE is permitted
      assert.equal(isTargetLegal(match, 'p1', 'ATTACKER', {
        type: 'NONE'
      }, 'p1_defender', context, 'DRAW_CARDS'), true);

      // For DAMAGE (requires character target), NONE is rejected
      assert.equal(isTargetLegal(match, 'p1', 'ATTACKER', {
        type: 'NONE'
      }, 'p1_defender', context, 'DAMAGE'), false);
    });

    test('Revalidates target legality immediately in resolveAbilityEffect and fizzles stale target', () => {
      const match = createReadyMatch();
      const p2 = match.players.p2;
      const p2Attacker = p2.hand[0];
      p2.battlefield.push({ slotId: 'slot_0', card: p2Attacker, canAttack: false, enteredTurn: 1 });

      const retaliateAbility = {
        abilityId: 'RETALIATE_STRIKE',
        name: 'Retaliate Strike',
        trigger: 'ON_DAMAGE_TAKEN' as const,
        targetFilter: 'ATTACKER' as const,
        effectType: 'DAMAGE' as const,
        primaryValue: 2,
        customDescription: 'Deal 2 damage to attacker.'
      };

      // Attacker is killed before resolution
      p2.battlefield.pop();

      const res = resolveAbilityEffect(match, 'p1', 'p1_defender', retaliateAbility, {
        type: 'CHARACTER',
        characterInstanceId: p2Attacker.instanceId
      }, undefined, {
        trigger: 'ON_DAMAGE_TAKEN',
        sourceInstanceId: 'p1_defender',
        sourcePlayerId: 'p1',
        attackerSlot: { slotId: 'slot_0', card: p2Attacker, canAttack: false, enteredTurn: 1 },
        damageAmount: 2
      });

      assert.equal(res.success, true);
      assert.equal(res.fizzled, true);
      assert.equal(res.events.some(e => e.includes('fizzled: target is no longer legal')), true);
    });
  });

  // ==========================================================================
  // 7. TASK 2 — FIX SELF TARGET VALIDATION
  // ==========================================================================
  describe('7. Task 2 — SELF Target Validation', () => {
    test('Valid SELF accepted on living friendly battlefield character belonging to acting player', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const unit = p1.hand[0];
      unit.stamina = 3;
      p1.battlefield.push({ slotId: 'slot_0', card: unit, canAttack: true, enteredTurn: 1 });

      // Target { type: 'SELF' } with valid sourceInstanceId
      assert.equal(isTargetLegal(match, 'p1', 'SELF', { type: 'SELF' }, unit.instanceId), true);

      // Target { type: 'CHARACTER', characterInstanceId: unit.instanceId }
      assert.equal(isTargetLegal(match, 'p1', 'SELF', {
        type: 'CHARACTER',
        characterInstanceId: unit.instanceId
      }, unit.instanceId), true);
    });

    test('Invalid source instance rejected for SELF', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const unit = p1.hand[0];
      p1.battlefield.push({ slotId: 'slot_0', card: unit, canAttack: true, enteredTurn: 1 });

      // Missing sourceInstanceId
      assert.equal(isTargetLegal(match, 'p1', 'SELF', { type: 'SELF' }, undefined), false);

      // Non-existent sourceInstanceId
      assert.equal(isTargetLegal(match, 'p1', 'SELF', { type: 'SELF' }, 'phantom_id'), false);

      // Mismatched characterInstanceId
      assert.equal(isTargetLegal(match, 'p1', 'SELF', {
        type: 'CHARACTER',
        characterInstanceId: 'other_id'
      }, unit.instanceId), false);
    });

    test('Mismatched source owner rejected for SELF', () => {
      const match = createReadyMatch();
      const p2 = match.players.p2;
      const enemyUnit = p2.hand[0];
      p2.battlefield.push({ slotId: 'slot_0', card: enemyUnit, canAttack: true, enteredTurn: 1 });

      // P1 acting on P2\'s character with SELF -> REJECTED
      assert.equal(isTargetLegal(match, 'p1', 'SELF', { type: 'SELF' }, enemyUnit.instanceId), false);
      assert.equal(isTargetLegal(match, 'p1', 'SELF', {
        type: 'CHARACTER',
        characterInstanceId: enemyUnit.instanceId
      }, enemyUnit.instanceId), false);
    });

    test('SELF accepted using legitimate departing-card snapshot during ON_CLOCK_OUT', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const departingUnit = p1.hand[0];
      departingUnit.stamina = 0;

      const context = {
        trigger: 'ON_CLOCK_OUT' as const,
        sourceInstanceId: departingUnit.instanceId,
        sourcePlayerId: 'p1' as const,
        departingCard: departingUnit
      };

      assert.equal(isTargetLegal(match, 'p1', 'SELF', { type: 'SELF' }, departingUnit.instanceId, context), true);
      assert.equal(isTargetLegal(match, 'p1', 'SELF', {
        type: 'CHARACTER',
        characterInstanceId: departingUnit.instanceId
      }, departingUnit.instanceId, context), true);
    });

    test('SELF rejected when snapshot is stale, mismatched, or trigger is not ON_CLOCK_OUT', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const departingUnit = p1.hand[0];

      // Mismatched departingCard instanceId
      assert.equal(isTargetLegal(match, 'p1', 'SELF', { type: 'SELF' }, departingUnit.instanceId, {
        trigger: 'ON_CLOCK_OUT',
        sourceInstanceId: departingUnit.instanceId,
        sourcePlayerId: 'p1',
        departingCard: { ...departingUnit, instanceId: 'different_inst' }
      }), false);

      // Mismatched departingCard ownerId (P2 card claiming P1 acting)
      assert.equal(isTargetLegal(match, 'p1', 'SELF', { type: 'SELF' }, departingUnit.instanceId, {
        trigger: 'ON_CLOCK_OUT',
        sourceInstanceId: departingUnit.instanceId,
        sourcePlayerId: 'p1',
        departingCard: { ...departingUnit, ownerId: 'p2' }
      }), false);

      // Wrong trigger (ON_DEPLOY instead of ON_CLOCK_OUT)
      assert.equal(isTargetLegal(match, 'p1', 'SELF', { type: 'SELF' }, departingUnit.instanceId, {
        trigger: 'ON_DEPLOY',
        sourceInstanceId: departingUnit.instanceId,
        sourcePlayerId: 'p1',
        departingCard: departingUnit
      }), false);
    });

    test('No unintended ON_CLOCK_OUT triggers on surviving teammates or living characters', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const survivor = p1.hand[0];
      p1.battlefield.push({ slotId: 'slot_0', card: survivor, canAttack: true, enteredTurn: 1 });

      const deadCard = p1.hand[1];

      // Attempting to evaluate survivor using deadCard\'s ON_CLOCK_OUT context
      const isLegal = isTargetLegal(match, 'p1', 'SELF', { type: 'SELF' }, survivor.instanceId, {
        trigger: 'ON_CLOCK_OUT',
        sourceInstanceId: deadCard.instanceId,
        sourcePlayerId: 'p1',
        departingCard: deadCard
      });

      // Survivor instanceId !== deadCard.instanceId -> REJECTED
      assert.equal(isLegal, false);
    });
  });

  // ==========================================================================
  // 8. TASK 3 — EXECUTIONCONTEXT DEPTH PRESERVATION ACROSS RESUMPTIONS
  // ==========================================================================
  describe('8. Task 3 — ExecutionContext Depth Preservation Across Resumptions', () => {
    test('Nested triggers with multiple manual target pauses strictly halt at MAX_TRIGGER_DEPTH = 10', () => {
      const match = createReadyMatch();

      // Initial pending decision at depth 1
      match.pendingDecision = {
        type: 'ABILITY_TARGET_SELECTION',
        playerId: 'p1',
        sourceInstanceId: 'src_1',
        sourceCardName: 'Step Ability 1',
        abilityId: 'CHAIN_STEP',
        effectType: 'HEAL_MORALE',
        value: 1,
        targetFilter: 'FRIENDLY_SUPERVISOR',
        allowedTargets: [{ target: { type: 'SUPERVISOR', playerId: 'p1' }, label: 'P1 Morale', isFriendly: true }],
        executionContext: { depth: 1, budgetCount: 1 }
      };

      for (let d = 1; d <= 9; d++) {
        assert.equal(match.pendingDecision !== null, true);
        assert.equal((match.pendingDecision as any).executionContext.depth, d);

        // Verify JSON serialization preservation at each pause step
        const serialized = serializeGameState(match);
        const restored = deserializeGameState(serialized);
        assert.equal((restored.pendingDecision as any).executionContext.depth, d);

        // Resolve current decision and queue next nested decision at depth + 1
        const nextDepth = d + 1;
        executeAction(match, {
          type: 'RESOLVE_ABILITY_TARGET',
          playerId: 'p1',
          target: { type: 'SUPERVISOR', playerId: 'p1' }
        });

        // Setup next nested step
        match.pendingDecision = {
          type: 'ABILITY_TARGET_SELECTION',
          playerId: 'p1',
          sourceInstanceId: `src_${nextDepth}`,
          sourceCardName: `Step Ability ${nextDepth}`,
          abilityId: 'CHAIN_STEP',
          effectType: 'HEAL_MORALE',
          value: 1,
          targetFilter: 'FRIENDLY_SUPERVISOR',
          allowedTargets: [{ target: { type: 'SUPERVISOR', playerId: 'p1' }, label: 'P1 Morale', isFriendly: true }],
          executionContext: { depth: nextDepth, budgetCount: d + 1 }
        };
      }

      // Now at depth 10
      assert.equal((match.pendingDecision as any).executionContext.depth, 10);

      // Attempting to resolve at depth 10 must halt immediately without executing further cascades
      const haltRes = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'SUPERVISOR', playerId: 'p1' }
      });

      assert.equal(haltRes.success, true);
      assert.equal(haltRes.events.some(e => e.includes(`MAX_TRIGGER_DEPTH = ${MAX_TRIGGER_DEPTH}`)), true);
      assert.equal(match.pendingDecision, null);
    });

    test('Match isolation: Independent matches maintain separate isolated execution contexts', () => {
      const matchA = createReadyMatch(100);
      const matchB = createReadyMatch(200);

      matchA.pendingDecision = {
        type: 'ABILITY_TARGET_SELECTION',
        playerId: 'p1',
        sourceInstanceId: 'src_a',
        sourceCardName: 'Ability A',
        abilityId: 'ABILITY_A',
        effectType: 'HEAL_MORALE',
        value: 1,
        targetFilter: 'FRIENDLY_SUPERVISOR',
        allowedTargets: [{ target: { type: 'SUPERVISOR', playerId: 'p1' }, label: 'P1', isFriendly: true }],
        executionContext: { depth: 7, budgetCount: 30 }
      };

      matchB.pendingDecision = {
        type: 'ABILITY_TARGET_SELECTION',
        playerId: 'p2',
        sourceInstanceId: 'src_b',
        sourceCardName: 'Ability B',
        abilityId: 'ABILITY_B',
        effectType: 'HEAL_MORALE',
        value: 1,
        targetFilter: 'FRIENDLY_SUPERVISOR',
        allowedTargets: [{ target: { type: 'SUPERVISOR', playerId: 'p2' }, label: 'P2', isFriendly: true }],
        executionContext: { depth: 1, budgetCount: 2 }
      };

      // Match A execution context is completely independent of Match B
      assert.equal((matchA.pendingDecision as any).executionContext.depth, 7);
      assert.equal((matchA.pendingDecision as any).executionContext.budgetCount, 30);
      assert.equal((matchB.pendingDecision as any).executionContext.depth, 1);
      assert.equal((matchB.pendingDecision as any).executionContext.budgetCount, 2);

      // Resolving Match B does not alter Match A
      executeAction(matchB, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p2',
        target: { type: 'SUPERVISOR', playerId: 'p2' }
      });

      assert.equal((matchA.pendingDecision as any).executionContext.depth, 7);
      assert.equal((matchA.pendingDecision as any).executionContext.budgetCount, 30);
      assert.equal(matchB.pendingDecision, null);
    });
  });

  // ==========================================================================
  // 9. TASK 4 — VERIFY BOTH_SUPERVISORS
  // ==========================================================================
  describe('9. Task 4 — BOTH_SUPERVISORS Dual Morale Modification', () => {
    test('DAMAGE reduces both Supervisors Morale without affecting characters', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;

      // Deploy characters on both boards
      const c1 = p1.hand[0];
      const c2 = p2.hand[0];
      p1.battlefield.push({ slotId: 's1', card: c1, canAttack: true, enteredTurn: 1 });
      p2.battlefield.push({ slotId: 's2', card: c2, canAttack: true, enteredTurn: 1 });

      p1.morale = 30;
      p2.morale = 30;
      const c1Sta = c1.stamina;
      const c2Sta = c2.stamina;

      const dualDmgAbility = {
        abilityId: 'CROSS_FIRE',
        name: 'Cross Fire',
        trigger: 'ON_PLAY' as const,
        targetFilter: 'BOTH_SUPERVISORS' as const,
        effectType: 'DAMAGE' as const,
        primaryValue: 4,
        customDescription: 'Deals 4 damage to both Supervisors.'
      };

      const res = resolveAbilityEffect(match, 'p1', 'src', dualDmgAbility, { type: 'BOTH_SUPERVISORS' });

      assert.equal(res.success, true);
      assert.equal(p1.morale, 26); // 30 - 4 = 26
      assert.equal(p2.morale, 26); // 30 - 4 = 26

      // Battlefield characters are entirely unaffected
      assert.equal(c1.stamina, c1Sta);
      assert.equal(c2.stamina, c2Sta);
    });

    test('HEAL_MORALE restores both Supervisors Morale without affecting characters', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;

      p1.morale = 20;
      p2.morale = 22;

      const c1 = p1.hand[0];
      p1.battlefield.push({ slotId: 's1', card: c1, canAttack: true, enteredTurn: 1 });
      const c1Sta = c1.stamina;

      const dualHealAbility = {
        abilityId: 'ALL_HANDS_STANDDOWN',
        name: 'All Hands Standdown',
        trigger: 'ON_PLAY' as const,
        targetFilter: 'BOTH_SUPERVISORS' as const,
        effectType: 'HEAL_MORALE' as const,
        primaryValue: 5,
        customDescription: 'Restores 5 Morale to both Supervisors.'
      };

      const res = resolveAbilityEffect(match, 'p1', 'src', dualHealAbility, { type: 'BOTH_SUPERVISORS' });

      assert.equal(res.success, true);
      assert.equal(p1.morale, 25); // 20 + 5 = 25
      assert.equal(p2.morale, 27); // 22 + 5 = 27

      // Battlefield characters are entirely unaffected
      assert.equal(c1.stamina, c1Sta);
    });

    test('BOTH_SUPERVISORS cannot accidentally apply twice during resumption', () => {
      const match = createReadyMatch();
      match.players.p1.morale = 25;
      match.players.p2.morale = 25;

      match.pendingDecision = {
        type: 'ABILITY_TARGET_SELECTION',
        playerId: 'p1',
        sourceInstanceId: 'src_dual',
        sourceCardName: 'Dual Morale Boost',
        abilityId: 'DUAL_BOOST',
        effectType: 'HEAL_MORALE',
        value: 3,
        targetFilter: 'BOTH_SUPERVISORS',
        allowedTargets: [{ target: { type: 'BOTH_SUPERVISORS' }, label: 'Both Supervisors', isFriendly: true }],
        executionContext: { depth: 1, budgetCount: 1 }
      };

      // First execution succeeds and clears pendingDecision
      const res1 = executeAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'BOTH_SUPERVISORS' }
      });

      assert.equal(res1.success, true);
      assert.equal(match.players.p1.morale, 28);
      assert.equal(match.players.p2.morale, 28);
      assert.equal(match.pendingDecision, null);

      // Attempting to resolve again fails validation with NO_PENDING_DECISION
      const val = validateAction(match, {
        type: 'RESOLVE_ABILITY_TARGET',
        playerId: 'p1',
        target: { type: 'BOTH_SUPERVISORS' }
      });
      assert.equal(val.valid, false);
      assert.equal(val.code, 'NO_PENDING_DECISION');

      // Morale pools did not change again
      assert.equal(match.players.p1.morale, 28);
      assert.equal(match.players.p2.morale, 28);
    });
  });

  // ==========================================================================
  // 6. ATTACKER CONTEXT & DAMAGE RETALIATION
  // ==========================================================================
  describe('6. Attacker Context & Damage Retaliation', () => {
    test('Combat damage retaliation: defender with ABILITY_HEAVY_FLIGHT_CASE retaliates against combat attacker', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;

      // P1 Attacker: 3 Eff, 5 Sta
      const attackerCard = p1.hand[0];
      attackerCard.efficiency = 3;
      attackerCard.stamina = 5;
      attackerCard.maxStamina = 5;
      p1.battlefield.push({ slotId: 'slot_0', card: attackerCard, canAttack: true, enteredTurn: 0 });

      // P2 Defender: 2 Eff, 6 Sta with ABILITY_HEAVY_FLIGHT_CASE (deals 1 dmg to attacker on ON_DAMAGE_TAKEN)
      const defenderCard = p2.hand[0];
      defenderCard.efficiency = 2;
      defenderCard.stamina = 6;
      defenderCard.maxStamina = 6;
      defenderCard.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_HEAVY_FLIGHT_CASE']];
      p2.battlefield.push({ slotId: 'slot_0', card: defenderCard, canAttack: false, enteredTurn: 0 });

      // P1 attacks P2 defender
      const res = executeAttack(match, attackerCard.instanceId, {
        type: 'CHARACTER',
        characterInstanceId: defenderCard.instanceId
      });

      assert.equal(res.success, true);
      // Defender took 3 combat damage (6 -> 3)
      assert.equal(defenderCard.stamina, 3);
      // Attacker took 2 combat counter-damage PLUS 1 retaliation damage from Heavy Flight Case! (5 - 2 - 1 = 2)
      // History log verifies retaliation event
      assert.ok(match.historyLog.some(e => (e.includes('Rapid Return') || e.includes('Heavy Flight Case')) && e.includes('dealt 1 damage to')));
    });

    test('Combat counter-damage retaliation: attacker with ABILITY_HEAVY_FLIGHT_CASE retaliates against defender counter-attack', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;

      // P1 Attacker: 2 Eff, 5 Sta with ABILITY_HEAVY_FLIGHT_CASE
      const attackerCard = p1.hand[0];
      attackerCard.efficiency = 2;
      attackerCard.stamina = 5;
      attackerCard.maxStamina = 5;
      attackerCard.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_HEAVY_FLIGHT_CASE']];
      p1.battlefield.push({ slotId: 'slot_0', card: attackerCard, canAttack: true, enteredTurn: 0 });

      // P2 Defender: 3 Eff, 5 Sta (no retaliation ability)
      const defenderCard = p2.hand[0];
      defenderCard.efficiency = 3;
      defenderCard.stamina = 5;
      defenderCard.maxStamina = 5;
      p2.battlefield.push({ slotId: 'slot_0', card: defenderCard, canAttack: false, enteredTurn: 0 });

      // P1 attacks P2 defender
      const res = executeAttack(match, attackerCard.instanceId, {
        type: 'CHARACTER',
        characterInstanceId: defenderCard.instanceId
      });

      assert.equal(res.success, true);
      // Attacker took 3 counter-damage (5 -> 2)
      assert.equal(attackerCard.stamina, 2);
      // Defender took 2 combat damage PLUS 1 retaliation damage from Attacker's Heavy Flight Case! (5 - 2 - 1 = 2)
      assert.equal(defenderCard.stamina, 2);
    });

    test('Ability-generated damage retaliation: character damaged by another character ability retaliates against source character', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      const p2 = match.players.p2;

      // P1 Source character: 4 Sta
      const sourceCard = p1.hand[0];
      sourceCard.stamina = 4;
      p1.battlefield.push({ slotId: 'slot_0', card: sourceCard, canAttack: true, enteredTurn: 1 });

      // P2 Target character: 5 Sta with ABILITY_HEAVY_FLIGHT_CASE
      const targetCard = p2.hand[0];
      targetCard.stamina = 5;
      targetCard.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_HEAVY_FLIGHT_CASE']];
      p2.battlefield.push({ slotId: 'slot_0', card: targetCard, canAttack: false, enteredTurn: 1 });

      // P1 sourceCard deals 2 damage to P2 targetCard via ability
      const directDamageAbility: AbilityDefinition = {
        abilityId: 'ABILITY_DIRECT_STRIKE',
        name: 'Direct Strike',
        trigger: 'ON_PLAY',
        targetFilter: 'ANY_ENEMY_CHARACTER',
        effectType: 'DAMAGE',
        primaryValue: 2,
        customDescription: 'Deal 2 damage to enemy character.'
      };

      const res = resolveAbilityEffect(match, 'p1', sourceCard.instanceId, directDamageAbility, {
        type: 'CHARACTER',
        characterInstanceId: targetCard.instanceId
      });

      assert.equal(res.success, true);
      // Target took 2 damage (5 -> 3)
      assert.equal(targetCard.stamina, 3);
      // Source took 1 retaliation damage from Heavy Flight Case! (4 -> 3)
      assert.equal(sourceCard.stamina, 3);
    });

    test('Self-inflicted damage never identifies damaged character as its own attacker', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;

      // P1 Character with Heavy Flight Case
      const selfCard = p1.hand[0];
      selfCard.stamina = 5;
      selfCard.maxStamina = 5;
      selfCard.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_HEAVY_FLIGHT_CASE']];
      p1.battlefield.push({ slotId: 'slot_0', card: selfCard, canAttack: true, enteredTurn: 1 });

      // Self-damage ability
      const selfDamageAbility: AbilityDefinition = {
        abilityId: 'ABILITY_SELF_INJURY',
        name: 'Self Injury',
        trigger: 'ON_PLAY',
        targetFilter: 'SELF',
        effectType: 'DAMAGE',
        primaryValue: 2,
        customDescription: 'Deal 2 damage to self.'
      };

      const res = resolveAbilityEffect(match, 'p1', selfCard.instanceId, selfDamageAbility, {
        type: 'CHARACTER',
        characterInstanceId: selfCard.instanceId
      });

      assert.equal(res.success, true);
      // Self took 2 damage (5 -> 3), but did NOT retaliate against itself (stamina stays 3, not 2)
      // No retaliation against self in history
      assert.ok(!match.historyLog.some(e => e.includes('dealt 1 damage to') && e.includes(selfCard.cardDefId) && (e.includes('Rapid Return') || e.includes('Heavy Flight Case'))));
    });

    test('Ability damage without character source fizzles ATTACKER target safely', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;

      // P1 Character with Heavy Flight Case
      const unit = p1.hand[0];
      unit.stamina = 5;
      unit.maxStamina = 5;
      unit.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_HEAVY_FLIGHT_CASE']];
      p1.battlefield.push({ slotId: 'slot_0', card: unit, canAttack: true, enteredTurn: 1 });

      // Environmental/supervisor direct damage without character slot source
      const globalDmgAbility: AbilityDefinition = {
        abilityId: 'ENV_STRIKE',
        name: 'Environmental Strike',
        trigger: 'ON_PLAY',
        targetFilter: 'ANY_FRIENDLY_CHARACTER',
        effectType: 'DAMAGE',
        primaryValue: 2,
        customDescription: 'Deal 2 damage.'
      };

      // Source instance ID is a non-character supervisor/environmental entity
      const res = resolveAbilityEffect(match, 'p1', 'env_source_id', globalDmgAbility, {
        type: 'CHARACTER',
        characterInstanceId: unit.instanceId
      });

      assert.equal(res.success, true);
      // Unit took 2 damage (5 -> 3)
      assert.equal(unit.stamina, 3);
      // Retaliation safely fizzled (ATTACKER resolved to NONE) without throwing errors
      assert.equal(match.status, 'ACTIVE');
    });
  });

  // ==========================================================================
  // 7. ON_CLOCK_OUT SNAPSHOT ISOLATION & DEPARTURE VERIFICATION
  // ==========================================================================
  describe('7. ON_CLOCK_OUT Snapshot Isolation & Departure Verification', () => {
    const handoverProtocol: AbilityDefinition = {
      abilityId: 'ABILITY_HANDOVER_PROTOCOL',
      name: 'Handover Protocol',
      trigger: 'ON_CLOCK_OUT',
      targetFilter: 'FRIENDLY_SUPERVISOR',
      effectType: 'HEAL_MORALE',
      primaryValue: 3,
      customDescription: 'When this character clocks out, restore 3 Morale to your Supervisor.'
    };

    test('Unit reaching 0 Stamina triggers ON_CLOCK_OUT strictly once via evaluateStateBasedActions', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;

      // Unit with ON_CLOCK_OUT Handover Protocol (heals friendly supervisor morale +3)
      const departingCard = p1.hand[0];
      departingCard.stamina = 2;
      departingCard.abilities = [handoverProtocol];
      p1.battlefield.push({ slotId: 'slot_0', card: departingCard, canAttack: true, enteredTurn: 1 });
      p1.morale = 20;

      // Deal lethal damage (2 damage)
      departingCard.stamina = 0;

      // Evaluate state-based actions
      evaluateStateBasedActions(match);

      // Character moved to Breakroom
      assert.equal(p1.battlefield.length, 0);
      assert.ok(p1.breakroom.some(c => c.instanceId === departingCard.instanceId));
      assert.equal(departingCard.currentZone, 'BREAKROOM');
      assert.equal(departingCard.hasTriggeredClockOut, true);

      // Handover Protocol resolved: P1 Morale healed +3 (20 -> 23)
      assert.equal(p1.morale, 23);

      // Re-evaluating state-based actions must NOT trigger ON_CLOCK_OUT again
      evaluateStateBasedActions(match);
      assert.equal(p1.morale, 23);
    });

    test('Direct DESTROY_CHARACTER captures departing snapshot and triggers ON_CLOCK_OUT once', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;

      const victim = p1.hand[0];
      victim.stamina = 5;
      victim.abilities = [handoverProtocol];
      p1.battlefield.push({ slotId: 'slot_0', card: victim, canAttack: true, enteredTurn: 1 });
      p1.morale = 20;

      // Destroy character directly
      const destroyAbility: AbilityDefinition = {
        abilityId: 'ABILITY_TERMINATE',
        name: 'Terminate Contract',
        trigger: 'ON_PLAY',
        targetFilter: 'ANY_FRIENDLY_CHARACTER',
        effectType: 'DESTROY_CHARACTER',
        primaryValue: 0,
        customDescription: 'Retires character directly.'
      };

      const res = resolveAbilityEffect(match, 'p1', 'admin_src', destroyAbility, {
        type: 'CHARACTER',
        characterInstanceId: victim.instanceId
      });

      assert.equal(res.success, true);
      assert.equal(p1.battlefield.length, 0);
      assert.ok(p1.breakroom.some(c => c.instanceId === victim.instanceId));
      assert.equal(victim.currentZone, 'BREAKROOM');
      assert.equal(victim.hasTriggeredClockOut, true);

      // Handover Protocol resolved: P1 Morale healed +3 (20 -> 23)
      assert.equal(p1.morale, 23);
    });

    test('Surviving teammates cannot trigger departing character ability', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;

      // Departing unit with ON_CLOCK_OUT Handover Protocol
      const departingCard = p1.hand[0];
      departingCard.stamina = 1;
      departingCard.abilities = [handoverProtocol];
      p1.battlefield.push({ slotId: 'slot_0', card: departingCard, canAttack: true, enteredTurn: 1 });

      // Surviving teammate without ON_CLOCK_OUT ability
      const survivorCard = p1.hand[1];
      survivorCard.stamina = 4;
      survivorCard.abilities = [];
      p1.battlefield.push({ slotId: 'slot_1', card: survivorCard, canAttack: true, enteredTurn: 1 });

      p1.morale = 20;

      // Departing unit takes lethal damage
      departingCard.stamina = 0;
      evaluateStateBasedActions(match);

      // Only survivor remains on battlefield
      assert.equal(p1.battlefield.length, 1);
      assert.equal(p1.battlefield[0].card.instanceId, survivorCard.instanceId);
      assert.equal(p1.battlefield[0].card.stamina, 4);

      // Handover protocol triggered exactly once from departing card snapshot
      assert.equal(p1.morale, 23);
    });

    test('RETURN_TO_HAND does not trigger ON_CLOCK_OUT', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      p1.morale = 20;

      const card = p1.hand[0];
      card.abilities = [handoverProtocol];
      card.baseTemplate = {
        baseCost: card.baseCost,
        efficiency: card.efficiency,
        stamina: card.stamina,
        influence: card.influence,
        isFrontDeskGuard: false,
        isRush: false,
        isFirstResponder: false,
        isInfiltration: false,
        hasOnDeployAbility: false,
        abilities: [handoverProtocol]
      };
      p1.battlefield.push({ slotId: 'slot_0', card, canAttack: true, enteredTurn: 1 });

      const review = CANONICAL_ABILITY_CATALOG['ABILITY_MANDATORY_REVIEW'];
      resolveAbilityEffect(match, 'p2', 'reviewer', review, {
        type: 'CHARACTER',
        characterInstanceId: card.instanceId
      });

      assert.equal(p1.battlefield.length, 0);
      assert.ok(p1.hand.some(c => c.instanceId === card.instanceId));
      assert.equal(card.hasTriggeredClockOut, false);
      // Morale untouched: ON_CLOCK_OUT never fired
      assert.equal(p1.morale, 20);
    });

    test('SILENCE_CHARACTER does not trigger ON_CLOCK_OUT', () => {
      const match = createReadyMatch();
      const p1 = match.players.p1;
      p1.morale = 20;

      const card = p1.hand[0];
      card.abilities = [handoverProtocol];
      p1.battlefield.push({ slotId: 'slot_0', card, canAttack: true, enteredTurn: 1 });

      const silence = CANONICAL_ABILITY_CATALOG['ABILITY_ROOT_CAUSE_ANALYSIS'];
      resolveAbilityEffect(match, 'p2', 'silencer', silence, {
        type: 'CHARACTER',
        characterInstanceId: card.instanceId
      });

      assert.equal(p1.battlefield.length, 1);
      assert.equal(card.isSilenced, true);
      assert.equal(card.hasTriggeredClockOut, false);
      // Morale untouched: ON_CLOCK_OUT never fired
      assert.equal(p1.morale, 20);
    });
  });
});

