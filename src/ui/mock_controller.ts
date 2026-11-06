/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Development Phase V1 — Mock Game Controller
 * 
 * Standalone mock controller providing realistic CCG demonstration state,
 * tactical board data, queue tickets, interactive triggers, and combat animations.
 * Completely decoupled from real engine mechanics.
 */

import { VisualGameState, GameViewCard, QueueTicketView, CombatEventLog, PendingDecisionView } from './types';

export const CARD_LIBRARY: GameViewCard[] = [
  {
    id: 'bw-c-001',
    templateId: 'dave_maestro',
    name: 'Dave, Patch Bay Maestro',
    cardType: 'CHARACTER',
    rarity: 'SUPERVISOR',
    department: 'TECH',
    shiftCost: 4,
    efficiency: 4,
    stamina: 5,
    maxStamina: 5,
    staminaBuffer: 2,
    influence: 2,
    keywords: ['Front Desk Guard', 'Rapid Solder'],
    abilityName: 'Emergency Patch',
    abilityDesc: 'Onboarding: Grant +2 Stamina Buffer to an adjacent ally.',
    flavor: '"If gaffer tape cannot fix it, it is not broken enough."',
    avatarGradient: 'from-amber-600 to-amber-900',
    iconName: 'Wrench',
    isGuard: true,
    isBuffered: true,
  },
  {
    id: 'bw-c-002',
    templateId: 'sarah_cable',
    name: 'Sarah, Cable Wrangler',
    cardType: 'CHARACTER',
    rarity: 'COMMON',
    department: 'TECH',
    shiftCost: 2,
    efficiency: 3,
    stamina: 4,
    maxStamina: 4,
    influence: 1,
    keywords: ['Fast Booking'],
    abilityName: 'Over-Under Coil',
    abilityDesc: 'Whenever Sarah damages an enemy, expedite friendly queue ticket by 1 turn.',
    flavor: '"Never wrap a BNC cable around your elbow. Ever."',
    avatarGradient: 'from-blue-600 to-cyan-900',
    iconName: 'Cable',
  },
  {
    id: 'bw-c-003',
    templateId: 'broadcast_camera',
    name: 'Broadcast 4K Camera Rig',
    cardType: 'CHARACTER',
    rarity: 'RARE',
    department: 'FACILITIES',
    shiftCost: 5,
    efficiency: 2,
    stamina: 6,
    maxStamina: 6,
    influence: 3,
    keywords: ['Heavy Duty', 'High Influence'],
    abilityName: 'Telephoto Zoom',
    abilityDesc: 'End of Shift: Generates +2 Influence if occupying the centre slot.',
    flavor: '"Value: $38,000. Do not let first-year film students touch the prism."',
    avatarGradient: 'from-emerald-600 to-teal-900',
    iconName: 'Camera',
    attachments: ['Heavy Duty Tripod'],
  },
  {
    id: 'bw-c-004',
    templateId: 'marcus_audio',
    name: 'Marcus, Audio Wizard',
    cardType: 'CHARACTER',
    rarity: 'UNCOMMON',
    department: 'TECH',
    shiftCost: 3,
    efficiency: 3,
    stamina: 3,
    maxStamina: 3,
    influence: 1,
    keywords: ['Noise Suppression'],
    abilityName: 'Phantom Power 48V',
    abilityDesc: 'Onboarding: Silence target enemy character until end of shift.',
    flavor: '"I can fix the hum, but I cannot fix your mic technique."',
    avatarGradient: 'from-indigo-600 to-purple-900',
    iconName: 'Mic',
  },
  {
    id: 'bw-c-005',
    templateId: 'bulb_catastrophe',
    name: 'Projector Bulb Catastrophe',
    cardType: 'INCIDENT',
    rarity: 'UNCOMMON',
    department: 'CHAOS',
    shiftCost: 2,
    efficiency: 0,
    stamina: 0,
    maxStamina: 0,
    influence: 0,
    keywords: ['Disruptor'],
    abilityName: 'Thermal Shutdown',
    abilityDesc: 'Deal 2 damage to all opposing characters; advance the Booking Queue by 1 turn.',
    flavor: '"The smell of melting 300W halogen is the smell of impending panic."',
    avatarGradient: 'from-red-600 to-orange-950',
    iconName: 'Flame',
  },
  {
    id: 'bw-c-006',
    templateId: 'gaffer_tape',
    name: 'Industrial Gaffer Tape',
    cardType: 'EQUIPMENT',
    rarity: 'COMMON',
    department: 'FACILITIES',
    shiftCost: 1,
    efficiency: 0,
    stamina: 0,
    maxStamina: 0,
    influence: 0,
    keywords: ['Ablative', 'Attachment'],
    abilityName: 'Emergency Binding',
    abilityDesc: 'Equipped character gains +3 Stamina Buffer and Front Desk Guard.',
    flavor: '"Leaves zero residue and holds together the entire Humber media curriculum."',
    avatarGradient: 'from-zinc-600 to-neutral-900',
    iconName: 'Shield',
  },
  {
    id: 'bw-c-007',
    templateId: 'emergency_override',
    name: 'Emergency Equipment Override',
    cardType: 'POLICY',
    rarity: 'RARE',
    department: 'ADMIN',
    shiftCost: 3,
    efficiency: 0,
    stamina: 0,
    maxStamina: 0,
    influence: 0,
    keywords: ['Priority Dispatch'],
    abilityName: 'Executive Exemption',
    abilityDesc: 'Immediately resolve the front ticket in your Booking Queue, bypassing wait turns.',
    flavor: '"Signed by the Academic Dean. Nobody dares question the purple ink stamp."',
    avatarGradient: 'from-amber-500 to-yellow-800',
    iconName: 'ScrollText',
  },
  {
    id: 'bw-c-008',
    templateId: 'freelance_grip',
    name: 'Freelance Studio Grip',
    cardType: 'CHARACTER',
    rarity: 'COMMON',
    department: 'FACILITIES',
    shiftCost: 2,
    efficiency: 2,
    stamina: 4,
    maxStamina: 4,
    influence: 1,
    keywords: ['Sandbag Mastery'],
    abilityName: 'Heavy Rigging',
    abilityDesc: 'Takes 1 less damage from all attacks.',
    flavor: '"Has worked forty-eight consecutive hours. Survives solely on cold espresso."',
    avatarGradient: 'from-stone-600 to-slate-900',
    iconName: 'Hammer',
  },
  {
    id: 'bw-c-009',
    templateId: 'maya_warden',
    name: 'Maya, Equipment Warden',
    cardType: 'CHARACTER',
    rarity: 'SUPERVISOR',
    department: 'ADMIN',
    shiftCost: 4,
    efficiency: 3,
    stamina: 6,
    maxStamina: 6,
    influence: 2,
    keywords: ['Strict Audit', 'Front Desk Guard'],
    abilityName: 'Asset Tag Interrogation',
    abilityDesc: 'Whenever an opponent deploys a character, they must pay +1 Shift.',
    flavor: '"If you didn\'t inspect the glass at checkout, that scratch is on your student record."',
    avatarGradient: 'from-rose-700 to-red-950',
    iconName: 'FileCheck',
    isGuard: true,
  },
  {
    id: 'bw-c-010',
    templateId: 'audit_intern',
    name: 'First-Year Audit Intern',
    cardType: 'CHARACTER',
    rarity: 'COMMON',
    department: 'ADMIN',
    shiftCost: 1,
    efficiency: 2,
    stamina: 2,
    maxStamina: 3,
    influence: 1,
    keywords: ['Eager Checklist'],
    flavor: '"Armed with a barcode scanner and unbridled disciplinary ambition."',
    avatarGradient: 'from-rose-800 to-zinc-900',
    iconName: 'Clipboard',
  },
  {
    id: 'bw-c-011',
    templateId: 'prof_hendershot',
    name: 'Prof. Hendershot (Guest Lecturer)',
    cardType: 'CHARACTER',
    rarity: 'RARE',
    department: 'CHAOS',
    shiftCost: 4,
    efficiency: 4,
    stamina: 3,
    maxStamina: 5,
    influence: 2,
    keywords: ['Tenured Immunity'],
    abilityName: 'Syllabus Revision',
    abilityDesc: 'Deals 3 damage to any character that attacks him.',
    flavor: '"In the 1980s on celluloid, we did not have HDMI handshakes."',
    avatarGradient: 'from-purple-800 to-slate-950',
    iconName: 'Glasses',
    isExhausted: true,
  },
  {
    id: 'bw-c-012',
    templateId: 'senior_archivist',
    name: 'Senior Archivist Eleanor',
    cardType: 'CHARACTER',
    rarity: 'UNCOMMON',
    department: 'BOOKING',
    shiftCost: 3,
    efficiency: 3,
    stamina: 5,
    maxStamina: 5,
    influence: 2,
    keywords: ['Front Desk Guard'],
    abilityName: 'Late Fee Sentence',
    abilityDesc: 'Reduce opposing Morale by 1 whenever an opposing ticket enters queue.',
    flavor: '"That BetaSP tape was due in the winter term of 1997."',
    avatarGradient: 'from-teal-700 to-slate-900',
    iconName: 'Archive',
    isGuard: true,
  },
  {
    id: 'bw-c-013',
    templateId: 'asset_tag_drone',
    name: 'Sub-Basement Asset Drone',
    cardType: 'CHARACTER',
    rarity: 'COMMON',
    department: 'TECH',
    shiftCost: 1,
    efficiency: 1,
    stamina: 2,
    maxStamina: 2,
    influence: 1,
    keywords: ['Automated'],
    flavor: '"Blares an 80dB alarm if you walk past door G-104 without scanning."',
    avatarGradient: 'from-cyan-700 to-slate-900',
    iconName: 'Cpu',
  },
  {
    id: 'bw-c-014',
    templateId: 'coffee_spill',
    name: 'Dark Roast on the Soundcraft',
    cardType: 'INCIDENT',
    rarity: 'COMMON',
    department: 'CHAOS',
    shiftCost: 1,
    efficiency: 0,
    stamina: 0,
    maxStamina: 0,
    influence: 0,
    keywords: ['Catastrophic Spill'],
    abilityName: 'Fader Corroder',
    abilityDesc: 'Silence target character and exhaust them.',
    flavor: '"Triple-double espresso meets motorized flying faders. Nobody wins."',
    avatarGradient: 'from-amber-900 to-stone-950',
    iconName: 'Coffee',
  },
  {
    id: 'bw-c-015',
    templateId: 'c_stand_forest',
    name: 'Forest of Century Stands',
    cardType: 'POLICY',
    rarity: 'UNCOMMON',
    department: 'FACILITIES',
    shiftCost: 2,
    efficiency: 0,
    stamina: 0,
    maxStamina: 0,
    influence: 0,
    keywords: ['Obstruction'],
    abilityName: 'Trip Hazard Zone',
    abilityDesc: 'Opposing characters entering battlefield arrive exhausted.',
    flavor: '"Forty-five steel knuckles at shin height in the dark studio hallway."',
    avatarGradient: 'from-slate-700 to-zinc-950',
    iconName: 'Boxes',
  }
];

export function createInitialDemoState(): VisualGameState {
  return {
    matchId: 'bw-match-772',
    turnNumber: 4,
    activePhase: 'OPERATIONAL_ACTION',
    activePlayerSide: 'PLAYER',
    player: {
      id: 'p1-dave',
      name: 'Dave (Lead Technician)',
      title: 'Patch Bay Maestro',
      department: 'TECH',
      avatarGradient: 'from-amber-600 via-amber-700 to-amber-900',
      morale: 24,
      maxMorale: 30,
      shiftAvailable: 6,
      shiftCap: 6,
      hand: [
        { ...CARD_LIBRARY[3] }, // Marcus Audio Wizard
        { ...CARD_LIBRARY[4] }, // Projector Bulb Catastrophe
        { ...CARD_LIBRARY[5] }, // Industrial Gaffer Tape
        { ...CARD_LIBRARY[6] }, // Emergency Equipment Override
        { ...CARD_LIBRARY[7] }, // Freelance Grip
      ],
      deckCount: 18,
      discardCount: 4,
      battlefield: [
        { slotIndex: 0, character: null },
        { 
          slotIndex: 1, 
          character: { 
            ...CARD_LIBRARY[1], 
            isExhausted: false 
          } 
        }, // Sarah
        { 
          slotIndex: 2, 
          character: { 
            ...CARD_LIBRARY[0], 
            isGuard: true, 
            isBuffered: true 
          } 
        }, // Dave
        { 
          slotIndex: 3, 
          character: { 
            ...CARD_LIBRARY[2], 
            isExhausted: true 
          } 
        }, // Broadcast Rig
        { slotIndex: 4, character: null },
      ]
    },
    opponent: {
      id: 'p2-maya',
      name: 'Maya (Equipment Warden)',
      title: 'Compliance Auditor',
      department: 'ADMIN',
      avatarGradient: 'from-rose-700 via-rose-800 to-red-950',
      morale: 19,
      maxMorale: 30,
      shiftAvailable: 5,
      shiftCap: 6,
      hand: [
        { ...CARD_LIBRARY[9] },
        { ...CARD_LIBRARY[10] },
        { ...CARD_LIBRARY[13] },
        { ...CARD_LIBRARY[14] }
      ],
      deckCount: 16,
      discardCount: 7,
      battlefield: [
        { 
          slotIndex: 0, 
          character: { 
            ...CARD_LIBRARY[9], 
            stamina: 2 
          } 
        }, // Audit Intern
        { 
          slotIndex: 1, 
          character: { 
            ...CARD_LIBRARY[10], 
            isExhausted: true 
          } 
        }, // Prof Hendershot
        { 
          slotIndex: 2, 
          character: { 
            ...CARD_LIBRARY[11], 
            isGuard: true 
          } 
        }, // Eleanor
        { slotIndex: 3, character: null },
        { 
          slotIndex: 4, 
          character: { 
            ...CARD_LIBRARY[12], 
            isExhausted: false 
          } 
        }, // Drone
      ]
    },
    queue: [
      {
        id: 'q-4091',
        ticketNumber: '#BK-4091',
        card: { ...CARD_LIBRARY[2], name: 'RED V-Raptor 8K Package' },
        turnsRemaining: 1,
        owner: 'PLAYER',
        priorityLevel: 'EXPEDITED'
      },
      {
        id: 'q-4092',
        ticketNumber: '#BK-4092',
        card: { ...CARD_LIBRARY[14], name: 'Mobile Audio Console' },
        turnsRemaining: 2,
        owner: 'OPPONENT',
        priorityLevel: 'STANDARD'
      },
      {
        id: 'q-4093',
        ticketNumber: '#BK-4093',
        card: { ...CARD_LIBRARY[7], name: 'Steadicam Support Arm' },
        turnsRemaining: 3,
        owner: 'PLAYER',
        priorityLevel: 'STANDARD'
      }
    ],
    pendingDecision: null,
    recentCombatLog: [
      {
        id: 'log-1',
        turn: 3,
        timestamp: '14:22:05',
        attackerName: 'Dave, Patch Bay Maestro',
        attackerPlayer: 'PLAYER',
        targetName: 'Audit Intern',
        damage: 3,
        counterDamage: 2,
        isDirectAttack: false
      },
      {
        id: 'log-2',
        turn: 3,
        timestamp: '14:22:18',
        attackerName: 'Prof. Hendershot',
        attackerPlayer: 'OPPONENT',
        targetName: 'Dave (Lead Technician)',
        damage: 4,
        isDirectAttack: true
      }
    ],
    isMatchFinished: false,
    winner: null
  };
}

export class MockGameController {
  private state: VisualGameState;
  private listeners: ((state: VisualGameState) => void)[] = [];

  constructor(initialState?: VisualGameState) {
    this.state = initialState || createInitialDemoState();
  }

  public getState(): VisualGameState {
    return this.state;
  }

  public subscribe(listener: (state: VisualGameState) => void): () => void {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l(this.state));
  }

  public reset() {
    this.state = createInitialDemoState();
    this.notify();
  }

  public advancePhase() {
    const phases: VisualGameState['activePhase'][] = [
      'SHIFT_START',
      'SHIFT_BUDGETING',
      'ADMIN_DRAW',
      'OPERATIONAL_ACTION',
      'CLOCK_OUT'
    ];
    const currentIndex = phases.indexOf(this.state.activePhase);
    const nextIndex = (currentIndex + 1) % phases.length;
    const nextPhase = phases[nextIndex];

    let newTurnNumber = this.state.turnNumber;
    let nextPlayer = this.state.activePlayerSide;

    let player = { ...this.state.player };
    let opponent = { ...this.state.opponent };
    let queue = [...this.state.queue];

    if (nextPhase === 'SHIFT_START') {
      // Phase 1: Shift Start — Ready all battlefield characters, advance queue countdowns
      const activeSide = this.state.activePlayerSide === 'PLAYER' ? player : opponent;
      activeSide.battlefield = activeSide.battlefield.map(slot => ({
        ...slot,
        character: slot.character ? { ...slot.character, isExhausted: false } : null
      }));

      // Decrement queue countdown
      queue = queue.map(ticket => {
        const remaining = Math.max(0, ticket.turnsRemaining - 1);
        return {
          ...ticket,
          turnsRemaining: remaining,
          priorityLevel: remaining === 1 ? 'EXPEDITED' : ticket.priorityLevel
        };
      });
    } else if (nextPhase === 'SHIFT_BUDGETING') {
      // Phase 2: Shift Budgeting — Refill Shift capacity up to cap (max 10)
      const activeSide = this.state.activePlayerSide === 'PLAYER' ? player : opponent;
      activeSide.shiftCap = Math.min(10, activeSide.shiftCap);
      activeSide.shiftAvailable = activeSide.shiftCap;
    } else if (nextPhase === 'ADMIN_DRAW') {
      // Phase 3: Administrative Draw — Draw 1 card if hand cap < 8
      const activeSide = this.state.activePlayerSide === 'PLAYER' ? player : opponent;
      if (activeSide.hand.length < 8 && activeSide.deckCount > 0) {
        activeSide.deckCount = Math.max(0, activeSide.deckCount - 1);
      }
    } else if (nextPhase === 'CLOCK_OUT') {
      // Phase 5: Clock Out — Expire temporary buffs and hand off turn to other player
      player.battlefield = player.battlefield.map(slot => ({
        ...slot,
        character: slot.character ? { ...slot.character, staminaBuffer: 0 } : null
      }));
      opponent.battlefield = opponent.battlefield.map(slot => ({
        ...slot,
        character: slot.character ? { ...slot.character, staminaBuffer: 0 } : null
      }));

      // Handoff to opponent
      nextPlayer = this.state.activePlayerSide === 'PLAYER' ? 'OPPONENT' : 'PLAYER';
      if (nextPlayer === 'PLAYER') {
        newTurnNumber += 1;
        player.shiftCap = Math.min(10, player.shiftCap + 1);
        opponent.shiftCap = Math.min(10, opponent.shiftCap + 1);
      }
    }

    this.state = {
      ...this.state,
      turnNumber: newTurnNumber,
      activePhase: nextPhase,
      activePlayerSide: nextPlayer,
      player,
      opponent,
      queue
    };

    this.notify();
  }

  public playCard(cardId: string, targetSlotIndex: number) {
    const cardIndex = this.state.player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return false;

    const card = this.state.player.hand[cardIndex];
    if (this.state.player.shiftAvailable < card.shiftCost) return false;

    if (card.cardType === 'CHARACTER') {
      // Validate slot availability
      const slot = this.state.player.battlefield.find(s => s.slotIndex === targetSlotIndex);
      if (!slot || slot.character !== null) return false;

      const newHand = [...this.state.player.hand];
      newHand.splice(cardIndex, 1);

      const newBattlefield = this.state.player.battlefield.map(s => {
        if (s.slotIndex === targetSlotIndex) {
          return {
            ...s,
            character: { ...card, isExhausted: true }
          };
        }
        return s;
      });

      this.state = {
        ...this.state,
        player: {
          ...this.state.player,
          shiftAvailable: this.state.player.shiftAvailable - card.shiftCost,
          hand: newHand,
          battlefield: newBattlefield
        }
      };

      this.notify();
      return true;
    } else if (card.cardType === 'INCIDENT') {
      // Catastrophe / Direct action
      const newHand = [...this.state.player.hand];
      newHand.splice(cardIndex, 1);

      // Apply 2 damage to all opposing characters
      const updatedOpponentSlots = this.state.opponent.battlefield.map(s => {
        if (!s.character) return s;
        const remainingStamina = s.character.stamina - 2;
        return {
          ...s,
          character: remainingStamina > 0 ? { ...s.character, stamina: remainingStamina } : null
        };
      });

      this.state = {
        ...this.state,
        player: {
          ...this.state.player,
          shiftAvailable: this.state.player.shiftAvailable - card.shiftCost,
          hand: newHand
        },
        opponent: {
          ...this.state.opponent,
          battlefield: updatedOpponentSlots
        },
        recentCombatLog: [
          {
            id: `log-${Date.now()}`,
            turn: this.state.turnNumber,
            timestamp: new Date().toLocaleTimeString(),
            attackerName: card.name,
            attackerPlayer: 'PLAYER',
            targetName: 'All Opponent Units (AOE)',
            damage: 2,
            isDirectAttack: false
          },
          ...this.state.recentCombatLog
        ]
      };

      this.notify();
      return true;
    }

    return false;
  }

  public executeAttack(
    attackerSlotIndex: number, 
    targetSlotIndex: number | 'SUPERVISOR'
  ) {
    if (this.state.activePhase !== 'OPERATIONAL_ACTION') {
      return false;
    }
    const attackerSlot = this.state.player.battlefield.find(s => s.slotIndex === attackerSlotIndex);
    if (!attackerSlot || !attackerSlot.character || attackerSlot.character.isExhausted) {
      return false;
    }

    const attacker = attackerSlot.character;

    if (targetSlotIndex === 'SUPERVISOR') {
      // Direct attack to opponent Morale
      const newMorale = Math.max(0, this.state.opponent.morale - attacker.efficiency);
      
      const newBattlefield = this.state.player.battlefield.map(s => 
        s.slotIndex === attackerSlotIndex 
          ? { ...s, character: { ...s.character!, isExhausted: true } }
          : s
      );

      this.state = {
        ...this.state,
        player: {
          ...this.state.player,
          battlefield: newBattlefield
        },
        opponent: {
          ...this.state.opponent,
          morale: newMorale
        },
        recentCombatLog: [
          {
            id: `log-${Date.now()}`,
            turn: this.state.turnNumber,
            timestamp: new Date().toLocaleTimeString(),
            attackerName: attacker.name,
            attackerPlayer: 'PLAYER',
            targetName: `${this.state.opponent.name} (Direct)`,
            damage: attacker.efficiency,
            isDirectAttack: true
          },
          ...this.state.recentCombatLog
        ],
        isMatchFinished: newMorale <= 0,
        winner: newMorale <= 0 ? 'PLAYER' : null
      };

      this.notify();
      return true;
    } else {
      // Unit combat vs opposing character
      const defenderSlot = this.state.opponent.battlefield.find(s => s.slotIndex === targetSlotIndex);
      if (!defenderSlot || !defenderSlot.character) return false;

      const defender = defenderSlot.character;

      // Calculate damage exchange with stamina buffer
      const defenderDamageReceived = attacker.efficiency;
      const attackerDamageReceived = defender.efficiency;

      let defenderBuffer = defender.staminaBuffer || 0;
      let defenderEffectiveDamage = defenderDamageReceived;
      if (defenderBuffer > 0) {
        const absorbed = Math.min(defenderBuffer, defenderEffectiveDamage);
        defenderBuffer -= absorbed;
        defenderEffectiveDamage -= absorbed;
      }
      const defenderNewStamina = defender.stamina - defenderEffectiveDamage;

      let attackerBuffer = attacker.staminaBuffer || 0;
      let attackerEffectiveDamage = attackerDamageReceived;
      if (attackerBuffer > 0) {
        const absorbed = Math.min(attackerBuffer, attackerEffectiveDamage);
        attackerBuffer -= absorbed;
        attackerEffectiveDamage -= absorbed;
      }
      const attackerNewStamina = attacker.stamina - attackerEffectiveDamage;

      const newPlayerSlots = this.state.player.battlefield.map(s => {
        if (s.slotIndex === attackerSlotIndex) {
          if (attackerNewStamina <= 0) return { ...s, character: null };
          return {
            ...s,
            character: {
              ...s.character!,
              stamina: attackerNewStamina,
              staminaBuffer: attackerBuffer,
              isExhausted: true
            }
          };
        }
        return s;
      });

      const newOpponentSlots = this.state.opponent.battlefield.map(s => {
        if (s.slotIndex === targetSlotIndex) {
          if (defenderNewStamina <= 0) return { ...s, character: null };
          return {
            ...s,
            character: {
              ...s.character!,
              stamina: defenderNewStamina,
              staminaBuffer: defenderBuffer
            }
          };
        }
        return s;
      });

      this.state = {
        ...this.state,
        player: { ...this.state.player, battlefield: newPlayerSlots },
        opponent: { ...this.state.opponent, battlefield: newOpponentSlots },
        recentCombatLog: [
          {
            id: `log-${Date.now()}`,
            turn: this.state.turnNumber,
            timestamp: new Date().toLocaleTimeString(),
            attackerName: attacker.name,
            attackerPlayer: 'PLAYER',
            targetName: defender.name,
            damage: defenderDamageReceived,
            counterDamage: attackerDamageReceived,
            isDirectAttack: false
          },
          ...this.state.recentCombatLog
        ]
      };

      this.notify();
      return true;
    }
  }

  public expediteTicket(ticketId: string) {
    const queue = this.state.queue.map(t => {
      if (t.id === ticketId) {
        const turnsRemaining = Math.max(0, t.turnsRemaining - 1);
        return {
          ...t,
          turnsRemaining,
          priorityLevel: 'EXPEDITED' as const
        };
      }
      return t;
    });

    this.state = {
      ...this.state,
      queue
    };
    this.notify();
  }

  public promptTargetDecision(prompt: string, source: GameViewCard) {
    this.state = {
      ...this.state,
      pendingDecision: {
        id: `dec-${Date.now()}`,
        title: 'Select Ability Target',
        description: prompt,
        sourceCard: source,
        targetFilter: 'ENEMY_CHARACTER',
        eligibleSlots: [
          { side: 'OPPONENT', slotIndex: 0 },
          { side: 'OPPONENT', slotIndex: 1 },
          { side: 'OPPONENT', slotIndex: 2 },
          { side: 'OPPONENT', slotIndex: 4 }
        ]
      }
    };
    this.notify();
  }

  public resolveDecision(slotIndex: number) {
    this.state = {
      ...this.state,
      pendingDecision: null
    };
    this.notify();
  }
}

export const defaultMockController = new MockGameController();
