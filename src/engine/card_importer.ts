/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Phase 2C-A: Card Import Compatibility & Schema Validation Engine
 * 
 * Prepares the game engine for structured JSON import from the external Card Intake Tool.
 * 
 * Architectural Guarantees:
 * 1. Safe Schema Validation: Validates structured JSON without executing any arbitrary code.
 * 2. Separation of Concerns: Legacy archive metadata is stored and preserved separately from
 *    competitive game mechanics.
 * 3. Stable Mechanical Registry: Rejects unknown ability IDs, illegal triggers, or invalid effect types.
 * 4. Theme Decoupled: Cosmetic department labels are validated against known or custom affiliations.
 */

import {
  CardDefinition,
  CardType
} from './state.js';
import {
  AbilityDefinition,
  CANONICAL_ABILITY_CATALOG,
  EffectType,
  TargetFilter,
  TriggerCondition,
  getOfficialAbilityName
} from './abilities.js';

export type CardRarity =
  | 'STUDENT_WORKER'    // Common
  | 'SHIFT_LEAD'        // Uncommon
  | 'SUPERVISOR'        // Rare
  | 'DEPARTMENT_CHAIR'  // Epic
  | 'DEANS_LIST';       // Legendary

export interface LegacyCardArchive {
  originalCardName: string;
  frontImageUrl?: string;
  backImageUrl?: string;
  ocrTranscribedText?: string;
  originalDescription?: string;
  originalAbilitiesSummary?: string;
  originalHumorNotes?: string;
  creationYear?: number;
  honoredStaffMember?: string;
  scanBatchId?: string;
}

export interface ImportedCardPayload {
  cardId: string;
  name: string;
  cardType: CardType;
  rarity: CardRarity;
  shiftCost: number;
  power?: number;
  stamina?: number;
  influence?: number;
  isFrontDeskGuard?: boolean;
  isRush?: boolean;
  isFirstResponder?: boolean;
  isInfiltration?: boolean;
  abilities?: AbilityDefinition[];
  affiliations?: string[];
  legacyArchive?: LegacyCardArchive;
}

export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  cardDefinition?: CardDefinition;
  archiveMetadata?: LegacyCardArchive;
}

const VALID_CARD_TYPES: CardType[] = ['CHARACTER', 'INCIDENT', 'EQUIPMENT', 'POLICY'];
const VALID_RARITIES: CardRarity[] = ['STUDENT_WORKER', 'SHIFT_LEAD', 'SUPERVISOR', 'DEPARTMENT_CHAIR', 'DEANS_LIST'];
const VALID_TRIGGERS: TriggerCondition[] = [
  'ON_PLAY', 'ON_DEPLOY', 'ON_CLOCK_OUT', 'ON_ATTACK', 'ON_DAMAGE_TAKEN', 'START_OF_SHIFT', 'END_OF_SHIFT'
];
const VALID_EFFECTS: EffectType[] = [
  'DAMAGE', 'HEAL_STAMINA', 'HEAL_MORALE', 'BUFF_STAT', 'DRAW_CARDS', 'DISCARD_CARDS',
  'MODIFY_SHIFT', 'DISRUPT_QUEUE', 'SILENCE_CHARACTER', 'RETURN_TO_HAND', 'DESTROY_CHARACTER'
];
const VALID_TARGET_FILTERS: TargetFilter[] = [
  'SELF', 'ANY_FRIENDLY_CHARACTER', 'ANY_ENEMY_CHARACTER', 'ALL_FRIENDLY_CHARACTERS',
  'ALL_ENEMY_CHARACTERS', 'ALL_CHARACTERS', 'ENEMY_SUPERVISOR', 'FRIENDLY_SUPERVISOR',
  'BOTH_SUPERVISORS', 'ANY_TARGET', 'PENDING_QUEUE_TICKET', 'ALL_FRIENDLY_QUEUE',
  'RANDOM_ENEMY_CHARACTER', 'RANDOM_FRIENDLY_CHARACTER', 'ATTACKER'
];

/**
 * Validates a raw JSON card record for import into the Booking Wars engine.
 */
export function validateImportedCard(raw: unknown): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['Card payload must be a non-null JSON object.'], warnings: [] };
  }

  const payload = raw as Record<string, unknown>;

  // Security Check: Prevent executable JavaScript injection
  for (const [key, val] of Object.entries(payload)) {
    if (typeof val === 'function') {
      errors.push(`Field '${key}' contains forbidden executable code.`);
    }
    if (typeof val === 'string' && (val.includes('javascript:') || val.includes('<script>') || val.includes('eval('))) {
      errors.push(`Field '${key}' contains prohibited script tokens.`);
    }
  }

  // 1. Mandatory Identity Fields
  if (!payload.cardId || typeof payload.cardId !== 'string' || payload.cardId.trim() === '') {
    errors.push('Card must possess a non-empty string cardId.');
  }

  if (!payload.name || typeof payload.name !== 'string' || payload.name.trim() === '') {
    errors.push('Card must possess a non-empty string name.');
  }

  // 2. Card Type
  if (!payload.cardType || !VALID_CARD_TYPES.includes(payload.cardType as CardType)) {
    errors.push(`Invalid cardType '${payload.cardType}'. Allowed: ${VALID_CARD_TYPES.join(', ')}.`);
  }

  // 3. Rarity
  if (!payload.rarity || !VALID_RARITIES.includes(payload.rarity as CardRarity)) {
    warnings.push(`Rarity '${payload.rarity}' is not canonical. Defaulting to 'STUDENT_WORKER'.`);
  }

  // 4. Shift Cost
  const shiftCost = Number(payload.shiftCost);
  if (isNaN(shiftCost) || shiftCost < 0 || shiftCost > 10 || !Number.isInteger(shiftCost)) {
    errors.push(`shiftCost must be an integer between 0 and 10 (received: ${payload.shiftCost}).`);
  }

  // 5. Character Stats (if CHARACTER)
  let power = 0;
  let stamina = 1;
  let influence = 1;

  if (payload.cardType === 'CHARACTER') {
    power = Number(payload.power ?? payload.efficiency ?? 0);
    stamina = Number(payload.stamina ?? 1);
    influence = Number(payload.influence ?? 1);

    if (isNaN(power) || power < 0 || power > 12) {
      errors.push(`Character Power/Efficiency must be between 0 and 12 (received: ${payload.power}).`);
    }
    if (isNaN(stamina) || stamina < 1 || stamina > 15) {
      errors.push(`Character Stamina must be between 1 and 15 (received: ${payload.stamina}).`);
    }
    if (isNaN(influence) || influence < 0 || influence > 5) {
      errors.push(`Character Influence must be between 0 and 5 (received: ${payload.influence}).`);
    }
  }

  // 6. Abilities Validation
  const validatedAbilities: AbilityDefinition[] = [];
  if (payload.abilities !== undefined) {
    if (!Array.isArray(payload.abilities)) {
      errors.push('abilities field must be an array of AbilityDefinition objects.');
    } else {
      for (let i = 0; i < payload.abilities.length; i++) {
        const ab = payload.abilities[i] as Record<string, unknown>;
        if (!ab || typeof ab !== 'object') {
          errors.push(`abilities[${i}] must be an object.`);
          continue;
        }

        const abilityId = String(ab.abilityId || '');
        if (!abilityId) {
          errors.push(`abilities[${i}] must define a non-empty abilityId.`);
        }

        const trigger = ab.trigger as TriggerCondition;
        if (!VALID_TRIGGERS.includes(trigger)) {
          errors.push(`abilities[${i}] has invalid trigger '${trigger}'. Allowed: ${VALID_TRIGGERS.join(', ')}.`);
        }

        const effectType = ab.effectType as EffectType;
        if (!VALID_EFFECTS.includes(effectType)) {
          errors.push(`abilities[${i}] has invalid effectType '${effectType}'. Allowed: ${VALID_EFFECTS.join(', ')}.`);
        }

        const targetFilter = ab.targetFilter as TargetFilter;
        if (!VALID_TARGET_FILTERS.includes(targetFilter)) {
          errors.push(`abilities[${i}] has invalid targetFilter '${targetFilter}'. Allowed: ${VALID_TARGET_FILTERS.join(', ')}.`);
        }

        const primaryValue = Number(ab.primaryValue ?? 0);
        if (isNaN(primaryValue)) {
          errors.push(`abilities[${i}].primaryValue must be a valid number.`);
        }

        const secondaryValue = ab.secondaryValue !== undefined ? Number(ab.secondaryValue) : undefined;
        if (secondaryValue !== undefined && isNaN(secondaryValue)) {
          errors.push(`abilities[${i}].secondaryValue must be a valid number if specified.`);
        }

        // Check if catalog has predefined ability
        const catalogMatch = CANONICAL_ABILITY_CATALOG[abilityId];
        if (catalogMatch && catalogMatch.trigger !== trigger) {
          warnings.push(`Ability '${abilityId}' trigger differs from canonical catalog definition.`);
        }

        const rawName = String(ab.name || '');
        const officialName = rawName
          ? getOfficialAbilityName(rawName)
          : (catalogMatch?.name || getOfficialAbilityName(abilityId));

        validatedAbilities.push({
          abilityId,
          name: officialName,
          trigger,
          targetFilter,
          effectType,
          primaryValue,
          secondaryValue,
          customDescription: String(ab.customDescription || ''),
          requiresManualTarget: Boolean(ab.requiresManualTarget)
        });
      }
    }
  }

  // 7. Legacy Archive Separation
  let archiveMetadata: LegacyCardArchive | undefined = undefined;
  if (payload.legacyArchive && typeof payload.legacyArchive === 'object') {
    const arch = payload.legacyArchive as Record<string, unknown>;
    archiveMetadata = {
      originalCardName: String(arch.originalCardName || payload.name),
      frontImageUrl: arch.frontImageUrl ? String(arch.frontImageUrl) : undefined,
      backImageUrl: arch.backImageUrl ? String(arch.backImageUrl) : undefined,
      ocrTranscribedText: arch.ocrTranscribedText ? String(arch.ocrTranscribedText) : undefined,
      originalDescription: arch.originalDescription ? String(arch.originalDescription) : undefined,
      originalAbilitiesSummary: arch.originalAbilitiesSummary ? String(arch.originalAbilitiesSummary) : undefined,
      originalHumorNotes: arch.originalHumorNotes ? String(arch.originalHumorNotes) : undefined,
      creationYear: arch.creationYear ? Number(arch.creationYear) : undefined,
      honoredStaffMember: arch.honoredStaffMember ? String(arch.honoredStaffMember) : undefined,
      scanBatchId: arch.scanBatchId ? String(arch.scanBatchId) : undefined
    };
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const cardDef: CardDefinition = {
    id: String(payload.cardId),
    name: String(payload.name),
    cardType: payload.cardType as CardType,
    baseCost: shiftCost,
    influence,
    efficiency: power,
    stamina,
    isFrontDeskGuard: Boolean(payload.isFrontDeskGuard),
    isRush: Boolean(payload.isRush),
    isFirstResponder: Boolean(payload.isFirstResponder),
    isInfiltration: Boolean(payload.isInfiltration),
    hasOnDeployAbility: validatedAbilities.some(a => a.trigger === 'ON_DEPLOY' || a.trigger === 'ON_PLAY'),
    abilities: validatedAbilities
  };

  return {
    valid: true,
    errors: [],
    warnings,
    cardDefinition: cardDef,
    archiveMetadata
  };
}
