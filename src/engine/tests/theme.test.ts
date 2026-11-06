import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  resolveToken,
  resolveDepartmentLabel,
  resolveEquipmentLabel,
  registerCustomTheme,
  validateCardSchemaForThemeIndependence,
  ThemeDictionary
} from '../theme.js';

describe('Theme & Terminology Decoupling Engine', () => {

  it('resolves built-in tokens across Humber, Broadcast, and Corporate themes', () => {
    // Combat attribute 'efficiency'
    assert.strictEqual(resolveToken('efficiency', 'humber_centre'), 'Efficiency');
    assert.strictEqual(resolveToken('efficiency', 'broadcast_stage'), 'Output');
    assert.strictEqual(resolveToken('efficiency', 'corporate_helpdesk'), 'Throughput');

    // Zone 'booking_queue'
    assert.strictEqual(resolveToken('booking_queue', 'humber_centre'), 'Booking Queue');
    assert.strictEqual(resolveToken('booking_queue', 'broadcast_stage'), 'Production Queue');
    assert.strictEqual(resolveToken('booking_queue', 'corporate_helpdesk'), 'Ticket Queue');

    // Master Key
    assert.strictEqual(resolveToken('master_key', 'humber_centre'), 'The Master Key');
    assert.strictEqual(resolveToken('master_key', 'broadcast_stage'), 'Executive Producer Override');
    assert.strictEqual(resolveToken('master_key', 'corporate_helpdesk'), 'Admin Token');
  });

  it('supports arbitrary runtime custom theme registration without engine code modifications', () => {
    const spaceTheme: ThemeDictionary = {
      id: 'orbital_station',
      name: 'Orbital Logistics Station',
      tagline: 'Deep space cargo dispatch and airlock maintenance.',
      tokens: {
        efficiency: 'Thruster Output',
        stamina: 'Hull Integrity',
        shift_cost: 'Reactor Energy',
        influence: 'Command Clearance',
        morale: 'Station Pressurization',
        shift_resource: 'Energy Cells',
        character: 'Crew Specialist',
        incident: 'Hull Breach Event',
        gear: 'EVA Module',
        booking_queue: 'Decompression Chamber',
        breakroom: 'Cryo Sleep Pods',
        board: 'Bridge Station',
        hand: 'Sensor Manifest',
        deck: 'Flight Manifest',
        master_key: 'Sub-Light Warp Injector'
      },
      departmentLabels: {
        cage_tech: 'Engineering Bay Techs',
        booking_specialist: 'Docking Dispatchers'
      }
    };

    registerCustomTheme(spaceTheme);

    assert.strictEqual(resolveToken('efficiency', 'orbital_station'), 'Thruster Output');
    assert.strictEqual(resolveToken('stamina', 'orbital_station'), 'Hull Integrity');
    assert.strictEqual(resolveToken('booking_queue', 'orbital_station'), 'Decompression Chamber');
    assert.strictEqual(resolveToken('breakroom', 'orbital_station'), 'Cryo Sleep Pods');
    assert.strictEqual(resolveToken('master_key', 'orbital_station'), 'Sub-Light Warp Injector');
    assert.strictEqual(resolveDepartmentLabel('cage_tech', 'orbital_station'), 'Engineering Bay Techs');
  });

  it('strictly decouples cosmetic classifications from mechanical card types', () => {
    const validCard = {
      id: 'card_tech_01',
      type: 'character' as const,
      shiftCost: 3,
      efficiency: 3,
      stamina: 4,
      influence: 2,
      departmentKey: 'cage_tech', // Purely cosmetic
      equipmentClassKey: 'camera' // Purely cosmetic
    };

    const validation = validateCardSchemaForThemeIndependence(validCard);
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.errors.length, 0);

    // Resolving cosmetic labels does not alter card's mechanical properties
    const humberDept = resolveDepartmentLabel(validCard.departmentKey, 'humber_centre');
    const stageDept = resolveDepartmentLabel(validCard.departmentKey, 'broadcast_stage');
    assert.strictEqual(humberDept, 'Cage Technicians');
    assert.strictEqual(stageDept, 'Grips & Gaffers');

    // Card's mechanical type remains 'character' regardless of display theme
    assert.strictEqual(validCard.type, 'character');
  });

  it('rejects cards that attempt to serialize invalid mechanical types', () => {
    const invalidCard = {
      id: 'card_broken',
      type: 'spell' as any, // Invalid mechanical type (not character, incident, or gear)
      shiftCost: 4,
      influence: 1
    };

    const validation = validateCardSchemaForThemeIndependence(invalidCard);
    assert.strictEqual(validation.valid, false);
    assert.match(validation.errors[0], /Invalid mechanical type 'spell'/);
  });

});
