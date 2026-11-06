/**
 * Core mathematical balance verification formulas for Booking Wars
 * Version: 1.1.0-CANON (Phase 1B Strict Mathematical Verification)
 * 
 * All formulas use canonical mechanical definitions:
 * - Efficiency: Combat damage output
 * - Stamina: Health / durability points
 * - Shift Cost: Energy resource cost (1-10)
 * - Influence: Board priority and tie-breaking authority (1-4)
 */

/**
 * 1. Vanilla Stat Curve Equation:
 * Total Stats = (2 * ShiftCost) + 1
 * Efficiency + Stamina = (2 * C) + 1
 * Rounding: Integer exact
 * Range: C in [1, 10] -> Stats in [3, 21]
 */
export function calculateVanillaBudget(shiftCost: number): number {
  if (shiftCost < 1) return 1;
  return (shiftCost * 2) + 1;
}

/**
 * 2. Influence Stat Tax Equation:
 * InfluenceTax = max(0, Influence - 1) * 1.5
 * Base Influence = 1 (tax = 0)
 * Each additional Influence costs 1.5 raw stat budget (~0.75 Shift)
 */
export function calculateInfluenceTax(influence: number): number {
  if (influence <= 1) return 0;
  return (influence - 1) * 1.5;
}

/**
 * 3. Booking Queue Discount Equation:
 * EffectiveQueueCost = max(1, round(ImmediateCost - (QueueTurns * 0.75)))
 * Rounding: Math.round (half-up arithmetic)
 * Floor: Strict minimum 1 Shift (no zero-cost exploits)
 */
export function calculateEffectiveQueueCost(immediateCost: number, queueTurns: number): number {
  if (queueTurns <= 0) return immediateCost;
  const discount = queueTurns * 0.75;
  return Math.max(1, Math.round(immediateCost - discount));
}

/**
 * 4. Shift Capacity Progression:
 * Capacity_t = min(10, t)
 * CumulativePool_T = sum_{t=1}^T min(10, t)
 */
export function getShiftCapacity(turn: number): number {
  return Math.max(1, Math.min(10, turn));
}

export function getCumulativeShiftPool(turn: number): number {
  let sum = 0;
  for (let t = 1; t <= turn; t++) {
    sum += getShiftCapacity(t);
  }
  return sum;
}

/**
 * Keyword & Ability Tax Table (in raw stat budget points):
 * 1 Shift Cost = 2.0 Stat Budget Points
 */
export const KEYWORD_TAXES = {
  front_desk_guard: 1.0, // 0.5 Shift cost
  rush: 1.5,             // 0.75 Shift cost
  first_responder: 3.0,  // 1.5 Shift cost (immediate face/minion attack)
  infiltration: 1.0,     // 0.5 Shift cost (bypasses Front Desk Guard)
  draw_one_card: 2.0     // 1.0 Shift cost
};

export interface CardBalanceEvaluation {
  expectedStats: number;
  actualAllocatedValue: number;
  delta: number;
  isBalanced: boolean;
  breakdown: {
    baseStats: number;
    influenceTax: number;
    keywordTaxes: number;
  };
}

export function evaluateCardBalance(card: {
  shiftCost: number;
  efficiency?: number;
  power?: number; // legacy alias
  stamina: number;
  influence: number;
  hasFrontDeskGuard?: boolean;
  hasRush?: boolean;
  hasCharge?: boolean; // legacy alias for first responder
  hasInfiltration?: boolean;
  cardsDrawn?: number;
}): CardBalanceEvaluation {
  const efficiency = card.efficiency ?? card.power ?? 0;
  const expectedStats = calculateVanillaBudget(card.shiftCost);
  
  // Base combat attributes
  const baseStats = efficiency + card.stamina;
  let allocatedValue = baseStats;
  
  // Influence Tax
  const influenceTax = calculateInfluenceTax(card.influence);
  allocatedValue += influenceTax;
  
  // Keyword Taxes
  let keywordTaxes = 0;
  if (card.hasFrontDeskGuard) {
    keywordTaxes += KEYWORD_TAXES.front_desk_guard;
  }
  if (card.hasRush) {
    keywordTaxes += KEYWORD_TAXES.rush;
  }
  if (card.hasCharge) {
    keywordTaxes += KEYWORD_TAXES.first_responder;
  }
  if (card.hasInfiltration) {
    keywordTaxes += KEYWORD_TAXES.infiltration;
  }
  if (card.cardsDrawn) {
    keywordTaxes += card.cardsDrawn * KEYWORD_TAXES.draw_one_card;
  }
  allocatedValue += keywordTaxes;

  const delta = allocatedValue - expectedStats;
  const isBalanced = Math.abs(delta) <= 1; // Allowed ±1 margin

  return {
    expectedStats,
    actualAllocatedValue: allocatedValue,
    delta,
    isBalanced,
    breakdown: {
      baseStats,
      influenceTax,
      keywordTaxes
    }
  };
}

/**
 * Deck archetype mana-curve definitions for simulation
 */
export interface DeckArchetype {
  name: string;
  costDistribution: Record<number, number>;
}

export const CANONICAL_ARCHETYPES: Record<string, DeckArchetype> = {
  aggro: {
    name: 'Cage Technicians Aggro',
    costDistribution: { 1: 8, 2: 10, 3: 6, 4: 4, 5: 2 } // Avg cost: 2.33
  },
  midrange: {
    name: 'Booking Specialist Midrange',
    costDistribution: { 1: 3, 2: 6, 3: 8, 4: 6, 5: 4, 6: 2, 7: 1 } // Avg cost: 3.43
  },
  control: {
    name: 'Bureaucratic Lockdown Control',
    costDistribution: { 1: 2, 2: 4, 3: 5, 4: 6, 5: 5, 6: 4, 7: 2, 8: 2 } // Avg cost: 4.30
  }
};

/**
 * First-Player Advantage Mathematical Simulation
 * Evaluates mana tempo and card availability across turns 1-6 for configurations A through I
 * Note: Config D is a PROVISIONAL BASELINE, not yet fully approved, as empirical simulations show 61.1% P1 win rate.
 */
export function evaluateFirstPlayerConfigurations(): {
  config: string;
  description: string;
  p1AdvantageScore: number; // 0 is perfect parity; positive = P1 favored; negative = P2 favored
  recommendation: 'REJECTED' | 'INSUFFICIENT' | 'PROVISIONAL_BASELINE' | 'EXPLORATORY';
}[] {
  return [
    {
      config: 'Config A (Equal)',
      description: 'P1: 4 cards, 1 Shift. P2: 4 cards, 1 Shift.',
      p1AdvantageScore: 12.5, // Heavy P1 tempo dominance (69.6% P1 win rate in combat sim)
      recommendation: 'REJECTED'
    },
    {
      config: 'Config B (Temp Resource Only)',
      description: 'P1: 4 cards, 1 Shift. P2: 4 cards, 1 Shift + Master Key.',
      p1AdvantageScore: -5.8, // P2 tempo spike but severe card exhaustion
      recommendation: 'REJECTED'
    },
    {
      config: 'Config C (Card Parity Only)',
      description: 'P1: 4 cards, 1 Shift. P2: 5 cards, 1 Shift.',
      p1AdvantageScore: 6.2, // P1 still maintains initiative into turn 5
      recommendation: 'INSUFFICIENT'
    },
    {
      config: 'Config D (Provisional Baseline)',
      description: 'P1: 4 cards, 1 Shift. P2: 5 cards, 1 Shift + The Master Key.',
      p1AdvantageScore: 0.4, // Theoretical model near zero, but combat sim shows 61.1% P1 win rate
      recommendation: 'PROVISIONAL_BASELINE'
    },
    {
      config: 'Config E (Double Master Key)',
      description: 'P1: 4 cards, 1 Shift. P2: 5 cards, 1 Shift + 2 Master Keys.',
      p1AdvantageScore: -1.2, // Dramatic compression towards parity (55.1% P1 win rate in sim)
      recommendation: 'EXPLORATORY'
    },
    {
      config: 'Config H (Sentry Guard)',
      description: 'P1: 4 cards, 1 Shift. P2: 5 cards, 1 Shift + 1 Key + 0/3 Front Desk Guard.',
      p1AdvantageScore: -0.8, // Absorbs early aggression (58.1% P1 win rate in sim)
      recommendation: 'EXPLORATORY'
    }
  ];
}
