/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Headless Deterministic Match Simulation Harness
 * Evaluates First-Player Advantage across Configurations A through I
 * Pure TypeScript — Zero External Dependencies
 */

export type StartingConfig =
  | 'CONFIG_A' // Baseline: P1 4 cards, P2 4 cards
  | 'CONFIG_B' // Resource only: P1 4 cards, P2 4 cards + 1 Master Key
  | 'CONFIG_C' // Card only: P1 4 cards, P2 5 cards
  | 'CONFIG_D' // Canonical Baseline: P1 4 cards, P2 5 cards + 1 Master Key
  | 'CONFIG_E' // Double Key: P1 4 cards, P2 5 cards + 2 Master Keys
  | 'CONFIG_F' // Super Card: P1 4 cards, P2 6 cards + 1 Master Key
  | 'CONFIG_G' // P1 T1 Freeze: P1 4 cards (no cards on T1), P2 5 cards + 1 Master Key
  | 'CONFIG_H' // Defensive Guard: P1 4 cards, P2 5 cards + 1 Key + 0/3 Front Desk Guard
  | 'CONFIG_I'; // Morale Buffer: P1 4 cards (30 Morale), P2 5 cards + 1 Key (35 Morale)

export type ArchetypeKey = 'aggro' | 'midrange' | 'control';

export interface SimCard {
  id: string;
  cost: number;
  power: number; // Internal combat efficiency
  stamina: number;
  influence: number;
  isFrontDeskGuard: boolean;
  isRush: boolean;
  isMasterKey?: boolean;
}

export interface SimPlayer {
  id: 'p1' | 'p2';
  morale: number;
  maxShift: number;
  currentShift: number;
  masterKeyCount: number;
  hand: SimCard[];
  deck: SimCard[];
  board: {
    card: SimCard;
    currentStamina: number;
    canAttack: boolean;
  }[];
  fatigueCounter: number;
}

export interface MatchResult {
  winner: 'p1' | 'p2' | 'DRAW';
  turns: number;
  p1FinalMorale: number;
  p2FinalMorale: number;
  p1Archetype: ArchetypeKey;
  p2Archetype: ArchetypeKey;
  config: StartingConfig;
}

export interface ConfigStats {
  config: StartingConfig;
  configName: string;
  totalMatches: number;
  p1Wins: number;
  p2Wins: number;
  draws: number;
  p1WinPct: number;
  p2WinPct: number;
  drawPct: number;
  avgTurns: number;
  medianTurns: number;
  confidenceInterval95: [number, number]; // [lower, upper] for P1 win %
  archetypeBreakdown: Record<string, { p1Wins: number; p2Wins: number; total: number; p1WinPct: number }>;
}

// Pseudo-Random Number Generator (Mulberry32) for 100% reproducible deterministic simulation
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle with seedable PRNG
export function shuffle<T>(array: T[], prng: () => number): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateDeck(archetype: ArchetypeKey): SimCard[] {
  const cards: SimCard[] = [];
  const costCurve: Record<ArchetypeKey, Record<number, number>> = {
    aggro: { 1: 8, 2: 10, 3: 6, 4: 4, 5: 2 },
    midrange: { 1: 3, 2: 6, 3: 8, 4: 6, 5: 4, 6: 2, 7: 1 },
    control: { 1: 2, 2: 4, 3: 5, 4: 6, 5: 5, 6: 4, 7: 2, 8: 2 }
  };

  const dist = costCurve[archetype];
  let idCounter = 1;

  for (const [costStr, count] of Object.entries(dist)) {
    const cost = parseInt(costStr);
    for (let i = 0; i < count; i++) {
      const budget = cost * 2 + 1;
      const isGuard = cost >= 3 && i % 3 === 0;
      const isRush = cost <= 3 && i % 4 === 1;
      let effectiveBudget = budget;
      if (isGuard) effectiveBudget -= 1;
      if (isRush) effectiveBudget -= 1.5;

      const power = Math.max(1, Math.floor(effectiveBudget / 2));
      const stamina = Math.max(1, Math.ceil(effectiveBudget - power));

      cards.push({
        id: `${archetype}-${cost}-${idCounter++}`,
        cost,
        power,
        stamina,
        influence: cost >= 4 ? 2 : 1,
        isFrontDeskGuard: isGuard,
        isRush
      });
    }
  }

  return cards;
}

export function simulateMatch(
  config: StartingConfig,
  p1Archetype: ArchetypeKey,
  p2Archetype: ArchetypeKey,
  seed: number
): MatchResult {
  const prng = mulberry32(seed);
  const p1Deck = shuffle(generateDeck(p1Archetype), prng);
  const p2Deck = shuffle(generateDeck(p2Archetype), prng);

  const p1: SimPlayer = {
    id: 'p1',
    morale: 30,
    maxShift: 0,
    currentShift: 0,
    masterKeyCount: 0,
    hand: [],
    deck: p1Deck,
    board: [],
    fatigueCounter: 0
  };

  const p2Morale = config === 'CONFIG_I' ? 35 : 30;

  const p2: SimPlayer = {
    id: 'p2',
    morale: p2Morale,
    maxShift: 0,
    currentShift: 0,
    masterKeyCount: 0,
    hand: [],
    deck: p2Deck,
    board: [],
    fatigueCounter: 0
  };

  // Setup based on Configuration
  // P1 draws 4 cards in all configs
  for (let i = 0; i < 4; i++) {
    if (p1.deck.length > 0) p1.hand.push(p1.deck.pop()!);
  }

  // P2 starting card count
  let p2CardCount = 4;
  if (config === 'CONFIG_C' || config === 'CONFIG_D' || config === 'CONFIG_E' || config === 'CONFIG_G' || config === 'CONFIG_H' || config === 'CONFIG_I') {
    p2CardCount = 5;
  } else if (config === 'CONFIG_F') {
    p2CardCount = 6;
  }

  for (let i = 0; i < p2CardCount; i++) {
    if (p2.deck.length > 0) p2.hand.push(p2.deck.pop()!);
  }

  // P2 Master Key resources
  if (config === 'CONFIG_B' || config === 'CONFIG_D' || config === 'CONFIG_F' || config === 'CONFIG_G' || config === 'CONFIG_H' || config === 'CONFIG_I') {
    p2.masterKeyCount = 1;
  } else if (config === 'CONFIG_E') {
    p2.masterKeyCount = 2;
  }

  // P2 Defensive Intercom Guard (CONFIG_H)
  if (config === 'CONFIG_H') {
    p2.board.push({
      card: {
        id: 'sentry-0',
        cost: 0,
        power: 0,
        stamina: 3,
        influence: 1,
        isFrontDeskGuard: true,
        isRush: false
      },
      currentStamina: 3,
      canAttack: false
    });
  }

  let turn = 0;
  const MAX_TURNS = 30;

  while (p1.morale > 0 && p2.morale > 0 && turn < MAX_TURNS) {
    turn++;

    // === PLAYER 1 TURN ===
    const isP1Restricted = config === 'CONFIG_G' && turn === 1;
    executeTurn(p1, p2, turn, isP1Restricted);
    if (p2.morale <= 0) {
      return { winner: 'p1', turns: turn, p1FinalMorale: p1.morale, p2FinalMorale: p2.morale, p1Archetype, p2Archetype, config };
    }

    // === PLAYER 2 TURN ===
    executeTurn(p2, p1, turn, false);
    if (p1.morale <= 0) {
      return { winner: 'p2', turns: turn, p1FinalMorale: p1.morale, p2FinalMorale: p2.morale, p1Archetype, p2Archetype, config };
    }
  }

  // Draw or turn-limit resolution
  if (p1.morale <= 0 && p2.morale <= 0) return { winner: 'DRAW', turns: turn, p1FinalMorale: p1.morale, p2FinalMorale: p2.morale, p1Archetype, p2Archetype, config };
  if (p1.morale > p2.morale) return { winner: 'p1', turns: turn, p1FinalMorale: p1.morale, p2FinalMorale: p2.morale, p1Archetype, p2Archetype, config };
  if (p2.morale > p1.morale) return { winner: 'p2', turns: turn, p1FinalMorale: p1.morale, p2FinalMorale: p2.morale, p1Archetype, p2Archetype, config };
  return { winner: 'DRAW', turns: turn, p1FinalMorale: p1.morale, p2FinalMorale: p2.morale, p1Archetype, p2Archetype, config };
}

function executeTurn(active: SimPlayer, defender: SimPlayer, currentTurn: number, isDeploymentRestricted: boolean) {
  // Phase 1: Shift Start (Ready board)
  for (const slot of active.board) {
    slot.canAttack = true;
  }

  // Phase 2: Shift Budgeting (Cap 10)
  active.maxShift = Math.min(10, active.maxShift + 1);
  active.currentShift = active.maxShift;

  // Phase 3: Draw Card
  if (active.deck.length > 0) {
    if (active.hand.length < 8) {
      active.hand.push(active.deck.pop()!);
    } else {
      active.deck.pop(); // Burned due to hand limit
    }
  } else {
    // Burnout Fatigue
    active.fatigueCounter++;
    active.morale -= active.fatigueCounter;
    if (active.morale <= 0) return;
  }

  // Master Key evaluation: use if player has a card requiring exactly currentShift + 1
  if (active.masterKeyCount > 0) {
    const wantsPlay = active.hand.some(c => c.cost === active.currentShift + 1);
    if (wantsPlay) {
      active.currentShift += 1;
      active.masterKeyCount -= 1;
    }
  }

  // Phase 4: Operational Action Phase
  // 1. Deploy cards from hand (Greedy curve play up to 5 board slots)
  if (!isDeploymentRestricted) {
    active.hand.sort((a, b) => b.cost - a.cost);
    const remainingHand: SimCard[] = [];

    for (const card of active.hand) {
      if (active.board.length < 5 && card.cost <= active.currentShift) {
        active.currentShift -= card.cost;
        active.board.push({
          card,
          currentStamina: card.stamina,
          canAttack: card.isRush // Rush allows immediate attack vs characters
        });
      } else {
        remainingHand.push(card);
      }
    }
    active.hand = remainingHand;
  }

  // 2. Declare Attacks
  for (const attacker of active.board) {
    if (!attacker.canAttack || attacker.currentStamina <= 0) continue;

    // Check Defender Front Desk Guards
    const guards = defender.board.filter(slot => slot.card.isFrontDeskGuard && slot.currentStamina > 0);

    if (guards.length > 0) {
      // Must attack Front Desk Guard
      const target = guards[0];
      // Simultaneous combat damage
      target.currentStamina -= attacker.card.power;
      attacker.currentStamina -= target.card.power;
      attacker.canAttack = false;
    } else {
      // No Guards active: choose between profitable trade or face attack
      // AI Heuristic: if face damage can win or attacker is small, go face
      const weakEnemy = defender.board.find(
        e => e.currentStamina > 0 && e.currentStamina <= attacker.card.power && e.card.power >= 2
      );

      if (weakEnemy && !attacker.card.isRush) {
        // Trade into high-threat weak enemy
        weakEnemy.currentStamina -= attacker.card.power;
        attacker.currentStamina -= weakEnemy.card.power;
        attacker.canAttack = false;
      } else {
        // Direct attack to enemy Supervisor's Morale
        defender.morale -= attacker.card.power;
        attacker.canAttack = false;
      }
    }

    if (defender.morale <= 0) return;
  }

  // State-Based Actions (SBA): Clear clocked-out characters
  active.board = active.board.filter(slot => slot.currentStamina > 0);
  defender.board = defender.board.filter(slot => slot.currentStamina > 0);
}

export const CONFIG_NAMES: Record<StartingConfig, string> = {
  CONFIG_A: 'Config A: Equal (P1 4c/1S vs P2 4c/1S)',
  CONFIG_B: 'Config B: Resource Only (P1 4c vs P2 4c + 1 Key)',
  CONFIG_C: 'Config C: Card Only (P1 4c vs P2 5c)',
  CONFIG_D: 'Config D: Baseline (P1 4c vs P2 5c + 1 Key)',
  CONFIG_E: 'Config E: Double Key (P1 4c vs P2 5c + 2 Keys)',
  CONFIG_F: 'Config F: Extra Card (P1 4c vs P2 6c + 1 Key)',
  CONFIG_G: 'Config G: P1 T1 Freeze (P1 No T1 Play vs P2 5c + 1 Key)',
  CONFIG_H: 'Config H: Sentry Guard (P1 4c vs P2 5c + 1 Key + 0/3 Guard)',
  CONFIG_I: 'Config I: Morale Cushion (P1 30M vs P2 35M + 5c + 1 Key)'
};

/**
 * Runs matches across archetype matchups for any subset of configurations
 */
export function runEmpiricalSimulation(
  matchesPerConfig = 2500,
  configsToTest: StartingConfig[] = ['CONFIG_A', 'CONFIG_B', 'CONFIG_C', 'CONFIG_D', 'CONFIG_E', 'CONFIG_F', 'CONFIG_G', 'CONFIG_H', 'CONFIG_I'],
  baseSeed = 1337
): ConfigStats[] {
  const archetypes: ArchetypeKey[] = ['aggro', 'midrange', 'control'];
  const results: ConfigStats[] = [];

  for (const config of configsToTest) {
    let p1Wins = 0;
    let p2Wins = 0;
    let draws = 0;
    const turnCounts: number[] = [];
    const archetypeBreakdown: Record<string, { p1Wins: number; p2Wins: number; total: number; p1WinPct: number }> = {};

    for (let i = 0; i < matchesPerConfig; i++) {
      const p1Arch = archetypes[i % archetypes.length];
      const p2Arch = archetypes[Math.floor(i / archetypes.length) % archetypes.length];
      const matchupKey = `${p1Arch}_vs_${p2Arch}`;

      if (!archetypeBreakdown[matchupKey]) {
        archetypeBreakdown[matchupKey] = { p1Wins: 0, p2Wins: 0, total: 0, p1WinPct: 0 };
      }

      const matchSeed = baseSeed + i * 17;
      const res = simulateMatch(config, p1Arch, p2Arch, matchSeed);

      turnCounts.push(res.turns);
      archetypeBreakdown[matchupKey].total++;

      if (res.winner === 'p1') {
        p1Wins++;
        archetypeBreakdown[matchupKey].p1Wins++;
      } else if (res.winner === 'p2') {
        p2Wins++;
        archetypeBreakdown[matchupKey].p2Wins++;
      } else {
        draws++;
      }
    }

    turnCounts.sort((a, b) => a - b);
    const avgTurns = turnCounts.reduce((sum, t) => sum + t, 0) / matchesPerConfig;
    const medianTurns = turnCounts[Math.floor(matchesPerConfig / 2)];
    const p1WinPct = (p1Wins / matchesPerConfig) * 100;
    const p2WinPct = (p2Wins / matchesPerConfig) * 100;
    const drawPct = (draws / matchesPerConfig) * 100;

    // 95% Confidence Interval for P1 win rate using normal approximation
    const p = p1Wins / matchesPerConfig;
    const margin = 1.96 * Math.sqrt((p * (1 - p)) / matchesPerConfig) * 100;
    const confidenceInterval95: [number, number] = [
      Math.max(0, parseFloat((p1WinPct - margin).toFixed(2))),
      Math.min(100, parseFloat((p1WinPct + margin).toFixed(2)))
    ];

    for (const key of Object.keys(archetypeBreakdown)) {
      const b = archetypeBreakdown[key];
      b.p1WinPct = parseFloat(((b.p1Wins / b.total) * 100).toFixed(1));
    }

    results.push({
      config,
      configName: CONFIG_NAMES[config] || config,
      totalMatches: matchesPerConfig,
      p1Wins,
      p2Wins,
      draws,
      p1WinPct: parseFloat(p1WinPct.toFixed(2)),
      p2WinPct: parseFloat(p2WinPct.toFixed(2)),
      drawPct: parseFloat(drawPct.toFixed(2)),
      avgTurns: parseFloat(avgTurns.toFixed(2)),
      medianTurns,
      confidenceInterval95,
      archetypeBreakdown
    });
  }

  return results;
}
