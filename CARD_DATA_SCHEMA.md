# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## CARD DATA SCHEMA SPECIFICATION
**Version:** 1.0.0-SCHEMA  
**Status:** Authoritative TypeScript & Database Contract  

---

### 1. PHILOSOPHICAL SEPARATION: ARCHIVE VS. GAMEPLAY
A fundamental principle of Booking Wars is the **clean separation of historical artifact metadata from competitive gameplay parameters**:
- **Legacy Archive Metadata:** Immutable capture of original card artwork (front/back photos), original text, names, inside jokes, and sentimental quotes from the historical physical cards.
- **Game Model Parameters:** The balanced, strictly typed, runtime-evaluated rules attributes (Shift Cost, Power, Stamina, Influence, Ability Effects) designed and verified for competitive play.

---

### 2. CANONICAL TYPESCRIPT DEFINITIONS

```typescript
/**
 * Canonical Rarity Tiers in Booking Wars
 */
export type CardRarity = 
  | 'STUDENT_WORKER'    // Common (Grey / White Badge)
  | 'SHIFT_LEAD'        // Uncommon (Green Lanyard)
  | 'SUPERVISOR'        // Rare (Blue Lanyard)
  | 'DEPARTMENT_CHAIR'  // Epic (Purple Badge)
  | 'DEANS_LIST';       // Legendary (Gold Holographic Foil)

/**
 * Fundamental Card Classifications
 */
export type CardType = 'CHARACTER' | 'INCIDENT' | 'EQUIPMENT' | 'POLICY';

/**
 * Workplace Affiliations / Personality Tags
 */
export type AffiliationTag = 
  | 'Technician'
  | 'Booking Specialist'
  | 'Administration'
  | 'Journalism'
  | 'Production'
  | 'Equipment Specialist'
  | 'Problem Solver'
  | 'Chaos Agent';

/**
 * Ability Trigger Timings
 */
export type TriggerCondition = 
  | 'ON_PLAY'            // Battlecry / Onboarding
  | 'ON_CLOCK_OUT'       // Deathrattle / Departing shift
  | 'ON_ATTACK'          // Triggers upon declaring attack
  | 'ON_DEFEND'          // Triggers upon being declared as combat target
  | 'ON_DAMAGE_TAKEN'    // Triggers when Stamina is reduced
  | 'START_OF_SHIFT'     // Triggers at start of player turn
  | 'END_OF_SHIFT'       // Triggers at conclusion of player turn
  | 'ON_QUEUE_RESOLVE'   // Triggers when ticket countdown finishes
  | 'STATIC_AURA'        // Continuous effect while on field
  | 'ACTIVATED';         // Manually clicked during Main Phase (costs Shift)

/**
 * Standardized Effect Operations (Deterministic Execution Only)
 */
export type EffectType =
  | 'DAMAGE'
  | 'HEAL_STAMINA'
  | 'HEAL_MORALE'
  | 'BUFF_STAT'
  | 'DRAW_CARDS'
  | 'DISCARD_CARDS'
  | 'SUMMON_CHARACTER'
  | 'ATTACH_EQUIPMENT'
  | 'QUEUE_TICKET'
  | 'DISRUPT_QUEUE'
  | 'MODIFY_SHIFT'
  | 'SILENCE_CHARACTER'
  | 'RETURN_TO_HAND'
  | 'DESTROY_CHARACTER';

/**
 * Target Selection Filter
 */
export type TargetFilter =
  | 'SELF'
  | 'ANY_FRIENDLY_CHARACTER'
  | 'ANY_ENEMY_CHARACTER'
  | 'ALL_FRIENDLY_CHARACTERS'
  | 'ALL_ENEMY_CHARACTERS'
  | 'ALL_CHARACTERS'
  | 'ENEMY_SUPERVISOR'
  | 'FRIENDLY_SUPERVISOR'
  | 'BOTH_SUPERVISORS'
  | 'ANY_TARGET'
  | 'PENDING_QUEUE_TICKET'
  | 'RANDOM_ENEMY_CHARACTER'
  | 'RANDOM_FRIENDLY_CHARACTER';

/**
 * Structured Ability Payload Definition
 */
export interface AbilityDefinition {
  abilityId: string;
  name: string;
  trigger: TriggerCondition;
  targetFilter: TargetFilter;
  effectType: EffectType;
  primaryValue: number;          // e.g. 3 damage, 2 cards, +1/+1
  secondaryValue?: number;        // e.g. duration or secondary stat buff
  keywordFlags?: {
    frontDeskGuard?: boolean;     // Taunt
    rush?: boolean;               // Attack characters on summon turn
    firstResponder?: boolean;     // Attack any target on summon turn (Charge)
    divineShift?: boolean;        // Ignores first instance of damage (Shield)
    overtimeCostMorale?: number;  // Allows emergency payment with Morale
    queueTurns?: number;          // Turns needed in queue if Queue ticket
  };
  customDescription: string;      // Human readable tooltip
}

/**
 * Historical Original Card Archive Record
 */
export interface LegacyCardArchive {
  originalCardName: string;
  frontImageUrl: string;
  backImageUrl?: string;
  ocrTranscribedText: string;
  originalDescription: string;
  originalAbilitiesSummary: string;
  originalHumorNotes: string;
  creationYear?: number;
  honoredStaffMember?: string;
  scanBatchId?: string;
}

/**
 * Complete Playable Game Card Definition
 */
export interface PlayableCard {
  cardId: string;                  // Unique UUID/Slug (e.g., 'bw-humber-001')
  name: string;                    // Official Playable Name
  cardType: CardType;              // Character, Incident, Equipment, Policy
  rarity: CardRarity;              // Common -> Legendary
  shiftCost: number;               // 0 to 10
  
  // Character Specific Statistics (null for non-characters)
  stats?: {
    power: number;                 // 0 to 12
    stamina: number;               // 1 to 15 (max base stamina)
    currentStamina: number;        // Tracked in live game state
    influence: number;             // 0 to 5
  };
  
  // Personality / Department Synergies
  affiliations: AffiliationTag[];
  
  // Predefined Validated Abilities
  abilities: AbilityDefinition[];
  
  // Equipment Properties (if cardType === 'EQUIPMENT')
  equipmentBonus?: {
    powerBonus: number;
    staminaBonus: number;
    influenceBonus: number;
    grantedKeywords?: string[];
  };

  // Card Presentation Assets
  artworkUrl: string;              // Standardized game frame art
  flavorQuote?: string;            // Humorous in-game quote
  
  // Bound Archive Record (Preserved Legacy Data)
  legacyArchive?: LegacyCardArchive;
  
  // Administrative Workflow Flags
  isOfficial: boolean;             // True only when approved by human admin
  proposalVersion?: number;
  reviewedBy?: string;
}
```

---

### 3. FIRESTORE COLLECTION MAPPINGS
1. `cards/{cardId}`: Stores all approved `PlayableCard` objects ready for constructed play.
2. `raw_cards/{rawCardId}`: Unprocessed or archived image uploads with OCR extracts.
3. `workshop_proposals/{proposalId}`: AI-proposed card designs awaiting administrative validation and approval.
4. `decks/{deckId}`: User-crafted 30-card decks referencing valid `cardId` keys.
