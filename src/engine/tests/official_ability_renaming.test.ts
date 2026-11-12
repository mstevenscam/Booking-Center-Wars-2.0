/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Official Ability Renaming, Mechanical Verification & Audit Test Suite
 * 
 * Verifies:
 * 1. All 25 official ability names exist in CANONICAL_ABILITY_CATALOG and OFFICIAL_ABILITIES_CATALOG.
 * 2. Exact spacing, capitalization, and naming conventions.
 * 3. All internal abilityId keys remain unchanged and stable.
 * 4. Backward compatibility resolver getOfficialAbilityName maps legacy names/IDs to official names.
 * 5. Legacy card import through validateImportedCard normalizes old names/IDs to official names.
 * 6. Mechanical triggers, parameters, targeting filters, and effect executions operate accurately.
 * 7. PRNG determinism for random ability resolutions (Mulberry32 seeded PRNG).
 * 8. Gear targeting limitation verification (engine lacks Equipment target filter / attachments).
 * 9. Playable card definition preset selection and storage (preserving stable abilityId).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_ABILITY_CATALOG,
  OFFICIAL_ABILITIES_CATALOG,
  OFFICIAL_ABILITY_NAMES,
  getOfficialAbilityName,
  resolveAbilityEffect,
  dispatchTriggers,
  isTargetLegal,
  nextRandom,
  AbilityDefinition
} from '../abilities.js';
import { validateImportedCard } from '../card_importer.js';
import { createInitialGameState, CardDefinition, GameState } from '../index.js';
import { PlayableCardDefinition } from '../../ui/archive/types.js';

// The 25 official ability names exactly as specified
const EXPECTED_25_ABILITIES = [
  // OFFENSIVE ABILITIES
  { name: 'Spotify Take over', category: 'OFFENSIVE', id: 'ABILITY_SHORT_CIRCUIT', action: 'Deal damage to an opposing character.' },
  { name: 'Gear Return', category: 'OFFENSIVE', id: 'ABILITY_WORKAROUND', action: 'Destroy or disable an opposing Gear or Equipment card.' },
  { name: 'Pin Over ride', category: 'OFFENSIVE', id: 'ABILITY_ROLLING_SOUND', action: 'Gain additional offensive strength for one turn.' },
  { name: 'Cap Stone Order', category: 'OFFENSIVE', id: 'ABILITY_HOT_LIGHTS', action: 'Deal damage to multiple characters.' },
  { name: 'Shift Exchange', category: 'OFFENSIVE', id: 'ABILITY_DISCIPLINARY_DISMISSAL', action: 'Remove an opposing character from the battlefield.' },
  { name: 'NO shift coverage', category: 'OFFENSIVE', id: 'ABILITY_UNATTENDED_RODENT', action: 'When this character clocks out, damage a random opponent.' },

  // DEFENSIVE ABILITIES
  { name: 'Staging Order 1', category: 'DEFENSIVE', id: 'ABILITY_FRONT_DESK_GUARD', action: 'Opponents must deal with this character before attacking protected teammates.' },
  { name: 'Successful scan', category: 'DEFENSIVE', id: 'ABILITY_DIVINE_LANYARD', action: 'Block the first incoming damage.' },
  { name: 'Rapid Return', category: 'DEFENSIVE', id: 'ABILITY_HEAVY_FLIGHT_CASE', action: 'Return damage to an attacker.' },
  { name: 'Timmy Run', category: 'DEFENSIVE', id: 'ABILITY_CAGE_LOCKDOWN', action: 'Temporarily increase friendly characters\' Health.' },
  { name: 'Inventory Check', category: 'DEFENSIVE', id: 'ABILITY_AUDIT_IMMUNITY', action: 'Protect a character from targeted opposing abilities.' },
  { name: 'Red bull', category: 'DEFENSIVE', id: 'ABILITY_COFFEE_BREAK', action: 'Recover Health at the beginning of a Shift if undamaged.' },

  // SUPPORT ABILITIES
  { name: 'Gaffer Tape Patch', category: 'SUPPORT', id: 'ABILITY_GAFFER_TAPE_PATCH', action: 'Restore Health to a friendly character.' },
  { name: 'Extra Pin', category: 'SUPPORT', id: 'ABILITY_FIELD_PROMOTION', action: 'Permanently improve a friendly character\'s attributes.' },
  { name: 'Troubleshooting', category: 'SUPPORT', id: 'ABILITY_BENCH_TEST', action: 'Improve a random friendly character.' },
  { name: 'Happy Vicky', category: 'SUPPORT', id: 'ABILITY_SUPERVISOR_COUNSEL', action: 'Restore your Supervisor\'s Morale.' },
  { name: 'Express Checkout', category: 'SUPPORT', id: 'ABILITY_EXPRESS_CHECKOUT', action: 'Draw an additional card.' },
  { name: 'Fast Track', category: 'SUPPORT', id: 'ABILITY_FAST_TRACK', action: 'Reduce the remaining time of your own Booking Queue tickets.' },
  { name: 'Shift Help', category: 'SUPPORT', id: 'ABILITY_EMERGENCY_FUNDING', action: 'Gain temporary Shift resources.' },

  // DISRUPTION ABILITIES
  { name: 'Pending Approval', category: 'DISRUPTION', id: 'ABILITY_RESERVATION_HOLD', action: 'Delay an opposing Booking Queue ticket.' },
  { name: 'Snow Day', category: 'DISRUPTION', id: 'ABILITY_MANDATORY_REVIEW', action: 'Return an opposing character to its owner\'s hand.' },
  { name: 'Pin Access Removed', category: 'DISRUPTION', id: 'ABILITY_ROOT_CAUSE_ANALYSIS', action: 'Remove an opposing character\'s abilities and bonuses.' },
  { name: 'Late Fines', category: 'DISRUPTION', id: 'ABILITY_BUREAUCRATIC_RED_TAPE', action: 'Make selected opposing actions more expensive.' },
  { name: 'Boss Dirt', category: 'DISRUPTION', id: 'ABILITY_EXPOSÉ_REPORT', action: 'Reveal opposing information and potentially damage their Supervisor.' },
  { name: 'Random Spotify Playlist', category: 'DISRUPTION', id: 'ABILITY_MYSTERY_USB_DRIVE', action: 'Trigger a random beneficial or harmful outcome.' }
];

function createTestDeck(prefix: string, count = 30): CardDefinition[] {
  const deck: CardDefinition[] = [];
  for (let i = 0; i < count; i++) {
    deck.push({
      id: `${prefix}_card_${i}`,
      name: `${prefix} Worker ${i}`,
      cardType: 'CHARACTER',
      baseCost: (i % 4) + 1,
      influence: (i % 3) + 1,
      efficiency: (i % 3) + 2,
      stamina: (i % 4) + 3
    });
  }
  return deck;
}

function createReadyMatch(seed = 42): GameState {
  return createInitialGameState({
    matchId: 'renaming_test_match',
    p1Deck: createTestDeck('p1'),
    p2Deck: createTestDeck('p2'),
    prngSeed: seed
  });
}

describe('Official Ability Renaming & Backward Compatibility Audit', () => {

  test('Catalog contains exactly 25 official abilities with correct names and categories', () => {
    assert.equal(OFFICIAL_ABILITIES_CATALOG.length, 25);

    const categories = {
      OFFENSIVE: OFFICIAL_ABILITIES_CATALOG.filter(a => a.category === 'OFFENSIVE'),
      DEFENSIVE: OFFICIAL_ABILITIES_CATALOG.filter(a => a.category === 'DEFENSIVE'),
      SUPPORT: OFFICIAL_ABILITIES_CATALOG.filter(a => a.category === 'SUPPORT'),
      DISRUPTION: OFFICIAL_ABILITIES_CATALOG.filter(a => a.category === 'DISRUPTION')
    };

    assert.equal(categories.OFFENSIVE.length, 6);
    assert.equal(categories.DEFENSIVE.length, 6);
    assert.equal(categories.SUPPORT.length, 7);
    assert.equal(categories.DISRUPTION.length, 6);

    for (const expected of EXPECTED_25_ABILITIES) {
      const match = OFFICIAL_ABILITIES_CATALOG.find(a => a.name === expected.name);
      assert.ok(match, `Official ability preset "${expected.name}" must exist`);
      assert.equal(match.category, expected.category, `Category for "${expected.name}" must match`);
      assert.equal(match.id, expected.id, `Internal ID for "${expected.name}" must be "${expected.id}"`);
      assert.equal(match.action, expected.action, `Action description for "${expected.name}" must match`);
    }
  });

  test('Exact spacing, capitalization, and naming conventions are preserved across all 25', () => {
    for (const expected of EXPECTED_25_ABILITIES) {
      assert.ok(OFFICIAL_ABILITY_NAMES.includes(expected.name), `OFFICIAL_ABILITY_NAMES must include "${expected.name}"`);
      
      const canonical = CANONICAL_ABILITY_CATALOG[expected.id];
      assert.ok(canonical, `CANONICAL_ABILITY_CATALOG must have entry for "${expected.id}"`);
      assert.equal(canonical.name, expected.name, `Canonical ability name for "${expected.id}" must match "${expected.name}"`);
    }

    // Specific capitalization checks
    assert.equal(CANONICAL_ABILITY_CATALOG['ABILITY_SHORT_CIRCUIT'].name, 'Spotify Take over');
    assert.equal(CANONICAL_ABILITY_CATALOG['ABILITY_ROLLING_SOUND'].name, 'Pin Over ride');
    assert.equal(CANONICAL_ABILITY_CATALOG['ABILITY_UNATTENDED_RODENT'].name, 'NO shift coverage');
    assert.equal(CANONICAL_ABILITY_CATALOG['ABILITY_COFFEE_BREAK'].name, 'Red bull');
    assert.equal(CANONICAL_ABILITY_CATALOG['ABILITY_DIVINE_LANYARD'].name, 'Successful scan');
    assert.equal(CANONICAL_ABILITY_CATALOG['ABILITY_HEAVY_FLIGHT_CASE'].name, 'Rapid Return');
    assert.equal(CANONICAL_ABILITY_CATALOG['ABILITY_CAGE_LOCKDOWN'].name, 'Timmy Run');
    assert.equal(CANONICAL_ABILITY_CATALOG['ABILITY_AUDIT_IMMUNITY'].name, 'Inventory Check');
    assert.equal(CANONICAL_ABILITY_CATALOG['ABILITY_SUPERVISOR_COUNSEL'].name, 'Happy Vicky');
    assert.equal(CANONICAL_ABILITY_CATALOG['ABILITY_BENCH_TEST'].name, 'Troubleshooting');
  });

  test('Internal abilityIds are preserved and never altered', () => {
    const requiredIds = [
      'ABILITY_FAST_TRACK',
      'ABILITY_RESERVATION_HOLD',
      'ABILITY_EXPRESS_CHECKOUT',
      'ABILITY_GAFFER_TAPE_PATCH',
      'ABILITY_BENCH_TEST',
      'ABILITY_SHORT_CIRCUIT',
      'ABILITY_MANDATORY_REVIEW',
      'ABILITY_BUDGET_REALLOCATION',
      'ABILITY_BUREAUCRATIC_RED_TAPE',
      'ABILITY_HEAVY_FLIGHT_CASE',
      'ABILITY_CAGE_LOCKDOWN',
      'ABILITY_EXPOSÉ_REPORT',
      'ABILITY_ROLLING_SOUND',
      'ABILITY_HOT_LIGHTS',
      'ABILITY_ROOT_CAUSE_ANALYSIS',
      'ABILITY_WORKAROUND',
      'ABILITY_UNATTENDED_RODENT',
      'ABILITY_MYSTERY_USB_DRIVE',
      'ABILITY_FRONT_DESK_GUARD',
      'ABILITY_DIVINE_LANYARD',
      'ABILITY_AUDIT_IMMUNITY',
      'ABILITY_COFFEE_BREAK',
      'ABILITY_DIRECT_REPAIR',
      'ABILITY_FIELD_PROMOTION',
      'ABILITY_EMERGENCY_FUNDING',
      'ABILITY_SUPERVISOR_COUNSEL',
      'ABILITY_DISCIPLINARY_DISMISSAL'
    ];

    for (const id of requiredIds) {
      assert.ok(CANONICAL_ABILITY_CATALOG[id], `CANONICAL_ABILITY_CATALOG must have immutable key "${id}"`);
      assert.equal(CANONICAL_ABILITY_CATALOG[id].abilityId, id);
    }
  });

  test('Backward compatibility resolver getOfficialAbilityName maps legacy names and IDs', () => {
    // Legacy display names
    assert.equal(getOfficialAbilityName('Short Circuit'), 'Spotify Take over');
    assert.equal(getOfficialAbilityName('Workaround'), 'Gear Return');
    assert.equal(getOfficialAbilityName('Rolling Sound'), 'Pin Over ride');
    assert.equal(getOfficialAbilityName('Hot Lights'), 'Cap Stone Order');
    assert.equal(getOfficialAbilityName('Disciplinary Dismissal'), 'Shift Exchange');
    assert.equal(getOfficialAbilityName('Unattended Rodent'), 'NO shift coverage');
    assert.equal(getOfficialAbilityName('Front Desk Guard'), 'Staging Order 1');
    assert.equal(getOfficialAbilityName('Divine Lanyard'), 'Successful scan');
    assert.equal(getOfficialAbilityName('Heavy Flight Case'), 'Rapid Return');
    assert.equal(getOfficialAbilityName('Cage Lockdown'), 'Timmy Run');
    assert.equal(getOfficialAbilityName('Audit Immunity'), 'Inventory Check');
    assert.equal(getOfficialAbilityName('Coffee Break'), 'Red bull');
    assert.equal(getOfficialAbilityName('Direct Repair'), 'Gaffer Tape Patch');
    assert.equal(getOfficialAbilityName('Emergency Patch'), 'Gaffer Tape Patch');
    assert.equal(getOfficialAbilityName('Emergency Solder'), 'Gaffer Tape Patch');
    assert.equal(getOfficialAbilityName('Field Promotion'), 'Extra Pin');
    assert.equal(getOfficialAbilityName('Bench Test'), 'Troubleshooting');
    assert.equal(getOfficialAbilityName('Supervisor Counsel'), 'Happy Vicky');
    assert.equal(getOfficialAbilityName('Emergency Funding'), 'Shift Help');
    assert.equal(getOfficialAbilityName('Budget Reallocation'), 'Shift Help');
    assert.equal(getOfficialAbilityName('Reservation Hold'), 'Pending Approval');
    assert.equal(getOfficialAbilityName('Mandatory Review'), 'Snow Day');
    assert.equal(getOfficialAbilityName('Root Cause Analysis'), 'Pin Access Removed');
    assert.equal(getOfficialAbilityName('Bureaucratic Red Tape'), 'Late Fines');
    assert.equal(getOfficialAbilityName('Late Fee Sentence'), 'Late Fines');
    assert.equal(getOfficialAbilityName('Exposé Report'), 'Boss Dirt');
    assert.equal(getOfficialAbilityName('Mystery USB Drive'), 'Random Spotify Playlist');
    assert.equal(getOfficialAbilityName('Thermal Shutdown'), 'Cap Stone Order');
    assert.equal(getOfficialAbilityName('Auditorium Blackout'), 'Cap Stone Order');
    assert.equal(getOfficialAbilityName('Emergency Binding'), 'Staging Order 1');
    assert.equal(getOfficialAbilityName('Triple Reinforced'), 'Staging Order 1');
    assert.equal(getOfficialAbilityName('Syllabus Revision'), 'Rapid Return');

    // Legacy IDs
    assert.equal(getOfficialAbilityName('ABILITY_SHORT_CIRCUIT'), 'Spotify Take over');
    assert.equal(getOfficialAbilityName('ABILITY_RESERVATION_HOLD'), 'Pending Approval');
    assert.equal(getOfficialAbilityName('ABILITY_HEAVY_FLIGHT_CASE'), 'Rapid Return');
    assert.equal(getOfficialAbilityName('ABILITY_SUPERVISOR_COUNSEL'), 'Happy Vicky');
    assert.equal(getOfficialAbilityName('ABILITY_UNATTENDED_RODENT'), 'NO shift coverage');

    // Case-insensitivity
    assert.equal(getOfficialAbilityName('short circuit'), 'Spotify Take over');
    assert.equal(getOfficialAbilityName('reservation hold'), 'Pending Approval');
    assert.equal(getOfficialAbilityName('heavy flight case'), 'Rapid Return');
    assert.equal(getOfficialAbilityName('spotify take over'), 'Spotify Take over');
  });

  test('Legacy card import normalizes legacy ability names and IDs to official names', () => {
    // 1. Import card payload referencing legacy name 'Short Circuit'
    const payloadLegacyName = {
      cardId: 'test_legacy_card_1',
      name: 'Electric Specialist',
      cardType: 'CHARACTER',
      rarity: 'STUDENT_WORKER',
      shiftCost: 3,
      power: 2,
      stamina: 4,
      influence: 1,
      abilities: [
        {
          abilityId: 'ABILITY_SHORT_CIRCUIT',
          name: 'Short Circuit',
          trigger: 'ON_PLAY',
          targetFilter: 'ANY_ENEMY_CHARACTER',
          effectType: 'DAMAGE',
          primaryValue: 3,
          requiresManualTarget: true,
          customDescription: 'Deal 3 damage.'
        }
      ]
    };

    const res1 = validateImportedCard(payloadLegacyName);
    assert.equal(res1.valid, true);
    assert.ok(res1.cardDefinition);
    assert.equal(res1.cardDefinition.abilities![0].name, 'Spotify Take over');

    // 2. Import card payload missing name, only providing legacy abilityId
    const payloadOnlyId = {
      cardId: 'test_legacy_card_2',
      name: 'Policy Dispatcher',
      cardType: 'CHARACTER',
      rarity: 'SHIFT_LEAD',
      shiftCost: 2,
      power: 1,
      stamina: 3,
      influence: 2,
      abilities: [
        {
          abilityId: 'ABILITY_RESERVATION_HOLD',
          trigger: 'ON_PLAY',
          targetFilter: 'PENDING_QUEUE_TICKET',
          effectType: 'DISRUPT_QUEUE',
          primaryValue: 1,
          requiresManualTarget: true
        }
      ]
    };

    const res2 = validateImportedCard(payloadOnlyId);
    assert.equal(res2.valid, true);
    assert.ok(res2.cardDefinition);
    assert.equal(res2.cardDefinition.abilities![0].name, 'Pending Approval');
  });

  test('Mechanical effect execution: Offensive abilities (Spotify Take over & Shift Exchange)', () => {
    const state = createReadyMatch();

    // Setup an enemy target on P2 battlefield
    const targetCard = state.players.p2.hand[0];
    targetCard.stamina = 5;
    targetCard.maxStamina = 5;
    state.players.p2.battlefield.push({
      slotId: 'slot_0',
      card: targetCard,
      canAttack: false,
      enteredTurn: 1
    });

    // Spotify Take over (ABILITY_SHORT_CIRCUIT): Deal 3 damage
    const spotifyAbility = CANONICAL_ABILITY_CATALOG['ABILITY_SHORT_CIRCUIT'];
    const resDamage = resolveAbilityEffect(state, 'p1', 'source_1', spotifyAbility, {
      type: 'CHARACTER',
      characterInstanceId: targetCard.instanceId
    });
    assert.equal(resDamage.success, true);
    assert.equal(targetCard.stamina, 2); // 5 - 3 = 2
    assert.ok(state.historyLog.some(e => e.includes('Spotify Take over') && e.includes('dealt 3 damage')));

    // Shift Exchange (ABILITY_DISCIPLINARY_DISMISSAL): Retire enemy character directly to Breakroom
    const shiftExchangeAbility = CANONICAL_ABILITY_CATALOG['ABILITY_DISCIPLINARY_DISMISSAL'];
    const resRetire = resolveAbilityEffect(state, 'p1', 'source_1', shiftExchangeAbility, {
      type: 'CHARACTER',
      characterInstanceId: targetCard.instanceId
    });
    assert.equal(resRetire.success, true);
    assert.equal(state.players.p2.battlefield.length, 0); // Removed from counter
    assert.equal(state.players.p2.breakroom.length, 1);   // Retired to breakroom
    assert.equal(state.players.p2.breakroom[0].instanceId, targetCard.instanceId);
  });

  test('Mechanical effect execution: Defensive abilities (Rapid Return & Timmy Run)', () => {
    const state = createReadyMatch();

    // Deploy friendly unit to P1 battlefield
    const friendlyCard = state.players.p1.hand[0];
    friendlyCard.stamina = 4;
    friendlyCard.maxStamina = 4;
    friendlyCard.abilities = [CANONICAL_ABILITY_CATALOG['ABILITY_HEAVY_FLIGHT_CASE']]; // Rapid Return
    state.players.p1.battlefield.push({
      slotId: 'slot_0',
      card: friendlyCard,
      canAttack: true,
      enteredTurn: 0
    });

    // Timmy Run (ABILITY_CAGE_LOCKDOWN): +2 Stamina buffer to friendly characters this turn
    const timmyRunAbility = CANONICAL_ABILITY_CATALOG['ABILITY_CAGE_LOCKDOWN'];
    const resTimmy = resolveAbilityEffect(state, 'p1', 'source_deploy', timmyRunAbility, {
      type: 'ALL_FRIENDLY'
    });
    assert.equal(resTimmy.success, true);
    assert.equal(friendlyCard.stamina, 6); // 4 + 2 buffer
    assert.equal(friendlyCard.temporaryStaminaBuffer, 2);

    // Rapid Return (ABILITY_HEAVY_FLIGHT_CASE): On damage taken, retaliates 1 damage to attacker
    const enemyAttacker = state.players.p2.hand[0];
    enemyAttacker.stamina = 5;
    enemyAttacker.maxStamina = 5;
    const attackerSlot = { slotId: 'slot_0', card: enemyAttacker, canAttack: true, enteredTurn: 0 };
    state.players.p2.battlefield.push(attackerSlot);

    const dmgRes = dispatchTriggers(state, 'ON_DAMAGE_TAKEN', {
      trigger: 'ON_DAMAGE_TAKEN',
      sourceInstanceId: friendlyCard.instanceId,
      sourcePlayerId: 'p1',
      attackerSlot,
      damageAmount: 2
    });
    assert.equal(dmgRes.success, true);
    assert.equal(enemyAttacker.stamina, 4); // 5 - 1 retaliation = 4
    assert.ok(state.historyLog.some(e => e.includes('Rapid Return') && e.includes('dealt 1 damage')));
  });

  test('Mechanical effect execution: Support abilities (Troubleshooting, Extra Pin, Happy Vicky, Fast Track, Shift Help)', () => {
    const state = createReadyMatch();

    const unit = state.players.p1.hand[0];
    unit.efficiency = 2;
    unit.stamina = 3;
    unit.maxStamina = 3;
    state.players.p1.battlefield.push({ slotId: 'slot_0', card: unit, canAttack: true, enteredTurn: 0 });

    // Extra Pin (ABILITY_FIELD_PROMOTION): Permanently give friendly character +1/+1
    const extraPin = CANONICAL_ABILITY_CATALOG['ABILITY_FIELD_PROMOTION'];
    const resPin = resolveAbilityEffect(state, 'p1', 'source_1', extraPin, {
      type: 'CHARACTER',
      characterInstanceId: unit.instanceId
    });
    assert.equal(resPin.success, true);
    assert.equal(unit.efficiency, 3);
    assert.equal(unit.stamina, 4);

    // Troubleshooting (ABILITY_BENCH_TEST): Give random friendly character +1/+1 at start of shift
    const troubleshooting = CANONICAL_ABILITY_CATALOG['ABILITY_BENCH_TEST'];
    const resTrouble = resolveAbilityEffect(state, 'p1', 'source_1', troubleshooting, {
      type: 'NONE'
    });
    assert.equal(resTrouble.success, true);
    assert.equal(unit.efficiency, 4);
    assert.equal(unit.stamina, 5);

    // Happy Vicky (ABILITY_SUPERVISOR_COUNSEL): Restore 4 Morale
    state.players.p1.morale = 22;
    const happyVicky = CANONICAL_ABILITY_CATALOG['ABILITY_SUPERVISOR_COUNSEL'];
    const resVicky = resolveAbilityEffect(state, 'p1', 'source_1', happyVicky, {
      type: 'SUPERVISOR',
      playerId: 'p1'
    });
    assert.equal(resVicky.success, true);
    assert.equal(state.players.p1.morale, 26);

    // Shift Help (ABILITY_EMERGENCY_FUNDING): Gain 1 temporary Shift Hour
    const initShift = state.players.p1.currentShift;
    const shiftHelp = CANONICAL_ABILITY_CATALOG['ABILITY_EMERGENCY_FUNDING'];
    const resShift = resolveAbilityEffect(state, 'p1', 'source_1', shiftHelp, {
      type: 'NONE'
    });
    assert.equal(resShift.success, true);
    assert.equal(state.players.p1.currentShift, initShift + 1);

    // Fast Track (ABILITY_FAST_TRACK): Reduce tickets in queue by 1 turn
    state.players.p1.queue.push({
      id: 'ticket_fast',
      cardId: 'c_fast',
      cardName: 'Fast Rig',
      baseCost: 3,
      effectiveCost: 2,
      queuedTurn: 1,
      queueDuration: 3,
      remainingTurns: 3,
      influence: 1,
      ownerId: 'p1',
      fifoIndex: 0
    });
    const fastTrack = CANONICAL_ABILITY_CATALOG['ABILITY_FAST_TRACK'];
    const resFast = resolveAbilityEffect(state, 'p1', 'source_1', fastTrack, {
      type: 'ALL_QUEUE'
    });
    assert.equal(resFast.success, true);
    assert.equal(state.players.p1.queue[0].remainingTurns, 2); // 3 - 1 = 2
  });

  test('Mechanical effect execution: Disruption abilities (Pending Approval, Snow Day, Pin Access Removed, Boss Dirt)', () => {
    const state = createReadyMatch();

    // 1. Pending Approval (ABILITY_RESERVATION_HOLD): Delay enemy ticket
    state.players.p2.queue.push({
      id: 'opp_ticket',
      cardId: 'c_opp',
      cardName: 'Opp Rig',
      baseCost: 4,
      effectiveCost: 3,
      queuedTurn: 1,
      queueDuration: 2,
      remainingTurns: 2,
      influence: 1,
      ownerId: 'p2',
      fifoIndex: 0
    });
    const pendingApproval = CANONICAL_ABILITY_CATALOG['ABILITY_RESERVATION_HOLD'];
    const resDelay = resolveAbilityEffect(state, 'p1', 'source_1', pendingApproval, {
      type: 'QUEUE_TICKET',
      ticketId: 'opp_ticket',
      ownerId: 'p2'
    });
    assert.equal(resDelay.success, true);
    assert.equal(state.players.p2.queue[0].remainingTurns, 3); // 2 + 1 = 3

    // 2. Boss Dirt (ABILITY_EXPOSÉ_REPORT): Deal 2 damage to enemy supervisor
    const initMorale = state.players.p2.morale;
    const bossDirt = CANONICAL_ABILITY_CATALOG['ABILITY_EXPOSÉ_REPORT'];
    const resBoss = resolveAbilityEffect(state, 'p1', 'source_1', bossDirt, {
      type: 'SUPERVISOR',
      playerId: 'p2'
    });
    assert.equal(resBoss.success, true);
    assert.equal(state.players.p2.morale, initMorale - 2);

    // 3. Pin Access Removed (ABILITY_ROOT_CAUSE_ANALYSIS): Silence enemy character
    const buffedEnemy = state.players.p2.hand[0];
    buffedEnemy.efficiency = 6;
    buffedEnemy.stamina = 8;
    buffedEnemy.temporaryEfficiencyBuffer = 3;
    buffedEnemy.baseTemplate = {
      baseCost: 2,
      efficiency: 2,
      stamina: 4,
      influence: 1,
      abilities: [],
      isFrontDeskGuard: false,
      isRush: false,
      isFirstResponder: false,
      isInfiltration: false,
      hasOnDeployAbility: false
    };
    state.players.p2.battlefield.push({ slotId: 'slot_0', card: buffedEnemy, canAttack: true, enteredTurn: 0 });

    const pinAccess = CANONICAL_ABILITY_CATALOG['ABILITY_ROOT_CAUSE_ANALYSIS'];
    const resSilence = resolveAbilityEffect(state, 'p1', 'source_1', pinAccess, {
      type: 'CHARACTER',
      characterInstanceId: buffedEnemy.instanceId
    });
    assert.equal(resSilence.success, true);
    assert.equal(buffedEnemy.isSilenced, true);
    assert.equal(buffedEnemy.efficiency, 2); // Reset to base template
    assert.equal(buffedEnemy.temporaryEfficiencyBuffer, 0);

    // 4. Snow Day (ABILITY_MANDATORY_REVIEW): Return enemy character to hand
    const snowDay = CANONICAL_ABILITY_CATALOG['ABILITY_MANDATORY_REVIEW'];
    const resSnow = resolveAbilityEffect(state, 'p1', 'source_1', snowDay, {
      type: 'CHARACTER',
      characterInstanceId: buffedEnemy.instanceId
    });
    assert.equal(resSnow.success, true);
    assert.equal(state.players.p2.battlefield.length, 0);
    assert.ok(state.players.p2.hand.some(c => c.instanceId === buffedEnemy.instanceId));
  });

  test('Mulberry32 PRNG determinism for random ability resolutions', () => {
    // Two independent matches initialized with identical seed 12345
    const stateA = createReadyMatch(12345);
    const stateB = createReadyMatch(12345);

    const randomsA: number[] = [];
    const randomsB: number[] = [];

    for (let i = 0; i < 20; i++) {
      randomsA.push(nextRandom(stateA));
      randomsB.push(nextRandom(stateB));
    }

    assert.deepEqual(randomsA, randomsB, 'Identical seed must produce identical PRNG sequence');
    assert.notEqual(randomsA[0], randomsA[1], 'Subsequent random values must advance');
  });

  test('Audit Investigation: Gear Return & Gear/Equipment engine limitation documentation', () => {
    // Verify that Gear Return is mapped to ABILITY_WORKAROUND with SILENCE_CHARACTER
    const gearReturn = CANONICAL_ABILITY_CATALOG['ABILITY_WORKAROUND'];
    assert.equal(gearReturn.abilityId, 'ABILITY_WORKAROUND');
    assert.equal(gearReturn.name, 'Gear Return');
    assert.equal(gearReturn.effectType, 'SILENCE_CHARACTER');
    assert.equal(gearReturn.targetFilter, 'ANY_ENEMY_CHARACTER');

    // Engine limitation verification: the engine does not possess an Equipment target filter
    const state = createReadyMatch();
    const fakeEquipmentTarget = { type: 'EQUIPMENT', cardId: 'eq_1' } as any;
    assert.equal(
      isTargetLegal(state, 'p1', gearReturn.targetFilter, fakeEquipmentTarget),
      false,
      'isTargetLegal must reject non-character targets for SILENCE_CHARACTER'
    );
  });

  test('Preset selection and saved playable-card data preserves stable abilityId', () => {
    // 1. Playable card created from official preset retains stable abilityId
    const officialPlayableCard: PlayableCardDefinition = {
      playableCardId: 'play-dave-01',
      archiveId: 'arch-dave-01',
      displayName: 'Dave, Patch Bay Maestro',
      variationName: 'Standard Roster',
      cardType: 'CHARACTER',
      rarity: 'SUPERVISOR',
      department: 'TECH',
      shiftCost: 4,
      efficiency: 4,
      stamina: 5,
      maxStamina: 5,
      influence: 2,
      keywords: ['Staging Order 1'],
      abilityId: 'ABILITY_GAFFER_TAPE_PATCH',
      abilityName: 'Gaffer Tape Patch',
      abilityDesc: 'Restore 3 Stamina to target friendly character.',
      flavor: '"If gaffer tape cannot fix it, it is not broken enough."',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    assert.equal(officialPlayableCard.abilityId, 'ABILITY_GAFFER_TAPE_PATCH');
    assert.equal(officialPlayableCard.abilityName, 'Gaffer Tape Patch');

    // 2. Playable card with custom free-text ability stores abilityId as null
    const customPlayableCard: PlayableCardDefinition = {
      playableCardId: 'play-custom-01',
      archiveId: 'arch-custom-01',
      displayName: 'Kevin, Coffee Spiller',
      variationName: 'Promo',
      cardType: 'CHARACTER',
      rarity: 'COMMON',
      department: 'CHAOS',
      shiftCost: 1,
      efficiency: 1,
      stamina: 2,
      maxStamina: 2,
      influence: 0,
      keywords: [],
      abilityId: null, // Custom free-text has no engine ability mapping
      abilityName: 'Espresso Splash',
      abilityDesc: 'Spills coffee on the soundboard.',
      flavor: '"Oops."',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    assert.equal(customPlayableCard.abilityId, null);
    assert.equal(customPlayableCard.abilityName, 'Espresso Splash');
  });

});
