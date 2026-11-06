/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Temporary Stamina Buffer Engine & State Evaluator (Option A)
 * 
 * Canonical Rule:
 * Temporary Stamina increases Current and Maximum Stamina for a specified duration.
 * Damage subtracts from Current Stamina first (acting as an ablative buffer).
 * At expiration, Maximum Stamina returns to its base value and Current Stamina
 * is clamped to the new Maximum Stamina:
 *   Stamina_end = min(Current Stamina, Base Max Stamina)
 * 
 * Pure TypeScript — Zero External Dependencies
 */

export interface StaminaBuff {
  id: string;
  amount: number; // Positive for buff, negative for debuff
  source: string;
  durationTurns: number; // 1 = expires at end of current turn
  appliedTurn: number;
}

export interface CharacterStaminaState {
  baseMaxStamina: number;
  currentStamina: number;
  temporaryBuffs: StaminaBuff[];
  permanentModifier: number; // e.g. permanent +1 or +2 from Gear/Training
}

/**
 * Creates a fresh character stamina state
 */
export function createCharacterStamina(baseStamina: number): CharacterStaminaState {
  return {
    baseMaxStamina: baseStamina,
    currentStamina: baseStamina,
    temporaryBuffs: [],
    permanentModifier: 0
  };
}

/**
 * Calculates current effective Maximum Stamina
 */
export function getEffectiveMaxStamina(state: CharacterStaminaState): number {
  const tempTotal = state.temporaryBuffs.reduce((sum, b) => sum + b.amount, 0);
  return Math.max(1, state.baseMaxStamina + state.permanentModifier + tempTotal);
}

/**
 * Calculates effective Base Maximum Stamina (without temporary buffs)
 */
export function getBaseEffectiveMaxStamina(state: CharacterStaminaState): number {
  return Math.max(1, state.baseMaxStamina + state.permanentModifier);
}

/**
 * Applies a temporary stamina buff or debuff
 * Increasing max stamina also increases current stamina by the same amount.
 */
export function applyTemporaryStaminaBuff(
  state: CharacterStaminaState,
  buff: { id: string; amount: number; source: string; durationTurns: number; currentTurn: number }
): CharacterStaminaState {
  const nextBuffs = [...state.temporaryBuffs, {
    id: buff.id,
    amount: buff.amount,
    source: buff.source,
    durationTurns: buff.durationTurns,
    appliedTurn: buff.currentTurn
  }];

  let nextCurrent = state.currentStamina + buff.amount;
  // If debuff reduces current stamina to 0 or below, minion will be flagged for SBA death
  const maxPossible = state.baseMaxStamina + state.permanentModifier + nextBuffs.reduce((sum, b) => sum + b.amount, 0);
  nextCurrent = Math.min(nextCurrent, maxPossible);

  return {
    ...state,
    currentStamina: nextCurrent,
    temporaryBuffs: nextBuffs
  };
}

/**
 * Applies permanent stamina modification (e.g., Equipment or Permanent Training)
 */
export function applyPermanentStaminaModifier(
  state: CharacterStaminaState,
  amount: number
): CharacterStaminaState {
  const nextPerm = state.permanentModifier + amount;
  const nextCurrent = state.currentStamina + amount;
  return {
    ...state,
    permanentModifier: nextPerm,
    currentStamina: Math.max(0, nextCurrent)
  };
}

/**
 * Applies combat or incident damage to character
 * Damage is subtracted directly from current stamina.
 */
export function applyDamage(
  state: CharacterStaminaState,
  damage: number
): CharacterStaminaState {
  return {
    ...state,
    currentStamina: Math.max(0, state.currentStamina - damage)
  };
}

/**
 * Applies healing up to the current effective maximum stamina
 */
export function applyHealing(
  state: CharacterStaminaState,
  healAmount: number
): CharacterStaminaState {
  const effectiveMax = getEffectiveMaxStamina(state);
  const nextCurrent = Math.min(effectiveMax, state.currentStamina + healAmount);
  return {
    ...state,
    currentStamina: nextCurrent
  };
}

/**
 * Executes Turn-End Expiration of temporary buffs
 * Any buff whose duration has elapsed is removed.
 * Maximum Stamina reverts, and Current Stamina is clamped to the new effective Maximum.
 */
export function expireTemporaryBuffs(
  state: CharacterStaminaState,
  currentTurn: number
): CharacterStaminaState {
  // Retain buffs that have turns remaining
  const activeBuffs: StaminaBuff[] = [];

  for (const buff of state.temporaryBuffs) {
    const turnsActive = currentTurn - buff.appliedTurn + 1;
    if (turnsActive < buff.durationTurns) {
      activeBuffs.push(buff);
    }
  }

  // Calculate new effective max stamina after expired buffs leave
  const tempTotal = activeBuffs.reduce((sum, b) => sum + b.amount, 0);
  const newMax = Math.max(1, state.baseMaxStamina + state.permanentModifier + tempTotal);

  // CLAMP: Current stamina cannot exceed new max stamina
  const clampedCurrent = Math.min(state.currentStamina, newMax);

  return {
    ...state,
    currentStamina: clampedCurrent,
    temporaryBuffs: activeBuffs
  };
}

/**
 * Transforms character into a new template (e.g. Demote to Intern, Polymorph)
 * Clears all existing temporary buffs and permanent modifiers, resetting to fresh state.
 */
export function transformCharacter(newBaseStamina: number): CharacterStaminaState {
  return createCharacterStamina(newBaseStamina);
}

/**
 * Returns character to hand (Recall / Bounce)
 * Clears all temporary buffs and permanent modifiers, returning to card base template.
 */
export function returnToHand(originalCardBaseStamina: number): CharacterStaminaState {
  return createCharacterStamina(originalCardBaseStamina);
}
