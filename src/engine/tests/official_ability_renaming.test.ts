/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Official Ability Renaming & Backward Compatibility Test Suite
 * 
 * Verifies:
 * 1. All 25 official ability names exist in CANONICAL_ABILITY_CATALOG and OFFICIAL_ABILITIES_CATALOG.
 * 2. Exact spacing and capitalization match official rules.
 * 3. All internal abilityId keys remain unchanged and stable.
 * 4. Backward compatibility resolver getOfficialAbilityName maps legacy names/IDs to official names.
 * 5. Mechanics, triggers, and values execute accurately under the renamed canonical definitions.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_ABILITY_CATALOG,
  OFFICIAL_ABILITIES_CATALOG,
  OFFICIAL_ABILITY_NAMES,
  getOfficialAbilityName,
  resolveAbilityEffect
} from '../abilities.js';
import { createInitialGameState, CardDefinition, GameState } from '../index.js';

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

describe('Official Ability Renaming & Backward Compatibility', () => {

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
      
      // Look up canonical catalog by internal ID
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

  test('Mechanical execution of abilities operates identically with official names', () => {
    const state = createReadyMatch();

    // Deploy a target card to P2 battlefield from hand
    const targetCard = state.players.p2.hand[0];
    targetCard.stamina = 5;
    targetCard.maxStamina = 5;
    state.players.p2.battlefield.push({
      slotId: 'slot_0',
      card: targetCard,
      canAttack: false,
      enteredTurn: 1
    });

    // 1. Spotify Take over (ABILITY_SHORT_CIRCUIT): Deal 3 damage to an enemy character
    const spotifyAbility = CANONICAL_ABILITY_CATALOG['ABILITY_SHORT_CIRCUIT'];
    const resDamage = resolveAbilityEffect(state, 'p1', 'source_1', spotifyAbility, {
      type: 'CHARACTER',
      characterInstanceId: targetCard.instanceId
    });

    assert.equal(resDamage.success, true);
    assert.equal(targetCard.stamina, 2); // 5 - 3 = 2
    assert.ok(state.historyLog.some(e => e.includes('Spotify Take over') && e.includes('dealt 3 damage')));

    // 2. Pending Approval (ABILITY_RESERVATION_HOLD): Delay queue ticket by +1
    state.players.p2.queue.push({
      id: 'ticket_1',
      cardId: 'card_1',
      cardName: 'Queued Card',
      baseCost: 3,
      effectiveCost: 2,
      queuedTurn: 1,
      queueDuration: 2,
      remainingTurns: 2,
      influence: 1,
      ownerId: 'p2',
      fifoIndex: 0
    });

    const pendingApprovalAbility = CANONICAL_ABILITY_CATALOG['ABILITY_RESERVATION_HOLD'];
    const resDelay = resolveAbilityEffect(state, 'p1', 'source_1', pendingApprovalAbility, {
      type: 'QUEUE_TICKET',
      ticketId: 'ticket_1',
      ownerId: 'p2'
    });

    assert.equal(resDelay.success, true);
    assert.equal(state.players.p2.queue[0].remainingTurns, 3); // 2 + 1 = 3
    assert.ok(state.historyLog.some(e => e.includes('Pending Approval') && e.includes('modified ticket')));

    // 3. Happy Vicky (ABILITY_SUPERVISOR_COUNSEL): Restore 4 Morale
    state.players.p1.morale = 20;
    const happyVickyAbility = CANONICAL_ABILITY_CATALOG['ABILITY_SUPERVISOR_COUNSEL'];
    const resMorale = resolveAbilityEffect(state, 'p1', 'source_1', happyVickyAbility, {
      type: 'SUPERVISOR',
      playerId: 'p1'
    });

    assert.equal(resMorale.success, true);
    assert.equal(state.players.p1.morale, 24); // 20 + 4 = 24
    assert.ok(state.historyLog.some(e => e.includes('Happy Vicky') && e.includes('restored 4 Morale')));
  });

});
