# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## CARD ABILITY LIBRARY & EFFECT TAXONOMY
**Version:** 1.0.0-EFFECTS  
**Authority:** Core Rules & Simulation Engineering  

---

### 1. OFFICIAL KEYWORD TAXONOMY
Keywords represent standardized game behaviors that are visually badged on card frames:

| Keyword | Card Game Analogue | Booking Wars Definition |
|:---|:---|:---|
| **Front Desk Guard** | Taunt / Sentinel | Opponents cannot target other friendly characters or the friendly Supervisor with attacks while this character is ready. |
| **Rush** | Rush | Can attack opposing Characters on the turn it is deployed, but cannot attack the opposing Supervisor directly on that turn. |
| **First Responder** | Charge / Haste | Can attack any legal target (including the opposing Supervisor) immediately on the turn it is deployed. |
| **Onboarding** | Battlecry / ETB | Triggers an effect immediately when played from hand to the battlefield. |
| **Clock Out** | Deathrattle | Triggers an effect when this character’s Stamina reaches 0 and it leaves the counter. |
| **Queue [N]** | Suspend / Staging | Placed into the Booking Queue for [N] turns before resolving its payload onto the board. |
| **Overtime [X]** | Health Pay / Overload | Allows casting or activating by paying [X] Morale or locking [X] Shift on the next turn. |
| **Divine Lanyard** | Divine Shield | Negates the first instance of damage this character would receive. |
| **Audit Immunity** | Elusive / Spell Ward | Cannot be targeted by enemy Incidents or targeted abilities. |
| **Coffee Break** | Regeneration / Heal | Restores [X] Stamina at the start of your turn if this character took no damage last turn. |
| **Barcode Scanner** | Piercing / Armor Shred | Damage dealt by this character ignores damage-reduction effects and Influence buffers. |

---

### 2. EXECUTION PIPELINE & INFINITE LOOP PREVENTION
To guarantee deterministic execution and absolute prevention of game crashes or infinite loops:

1. **Trigger Stack Limit:**
   - The game engine enforces `MAX_TRIGGER_DEPTH = 10`. If a cascading chain of triggers (e.g., A damages B -> B triggers damage on A -> A triggers damage on B) exceeds 10 iterations, the sequence is forcefully halted, logged, and marked as a deadlocked state.
2. **Atomic Resolution:**
   - Abilities resolve atomically. State-Based Actions (checking for 0 Stamina) run only between distinct trigger resolutions.
3. **Target Validity Verification (Fizzle Guard):**
   - If an ability selects a target during declaration, but that target leaves the board or becomes invalid prior to resolution, the ability "fizzles" harmlessly without throwing an error.
4. **No Code Execution from Text:**
   - All abilities are identified by a deterministic `abilityId` and parameter object. Card text is purely descriptive.

---

### 3. STANDARDIZED CORE ABILITIES CATALOG
Here are 24 balanced canonical ability presets ready for engine implementation:

#### A. Booking Specialist Department
1. **`ABILITY_FAST_TRACK` (Onboarding):**
   - *Text:* Reduce the countdown of all tickets currently in your Booking Queue by 1 turn.
   - *Payload:* `EffectType: DISRUPT_QUEUE`, `Value: -1`, `Target: ALL_FRIENDLY_QUEUE`.
2. **`ABILITY_RESERVATION_HOLD` (Activated - 2 Shift):**
   - *Text:* Delay target opposing queue ticket by +1 turn.
   - *Payload:* `EffectType: DISRUPT_QUEUE`, `Value: +1`, `Target: PENDING_QUEUE_TICKET`.
3. **`ABILITY_EXPRESS_CHECKOUT` (Onboarding):**
   - *Text:* Draw 1 card. If you control another Booking Specialist, draw 2 cards instead.
   - *Payload:* `EffectType: DRAW_CARDS`, `Value: 1` (conditional `2`).

#### B. Technician Department
4. **`ABILITY_GAFFER_TAPE_PATCH` (Onboarding):**
   - *Text:* Restore 3 Stamina to target damaged character or friendly Supervisor.
   - *Payload:* `EffectType: HEAL_STAMINA`, `Value: 3`, `Target: ANY_FRIENDLY_CHARACTER`.
5. **`ABILITY_SHORT_CIRCUIT` (Incident Effect):**
   - *Text:* Deal 3 damage to an enemy character. If it has Equipment, destroy that Equipment.
   - *Payload:* `EffectType: DAMAGE`, `Value: 3`, `Target: ANY_ENEMY_CHARACTER`.
6. **`ABILITY_BENCH_TEST` (Start of Shift):**
   - *Text:* Give a random friendly character with Equipment +1/+1.
   - *Payload:* `EffectType: BUFF_STAT`, `Value: 1`, `Target: RANDOM_FRIENDLY_CHARACTER`.

#### C. Administration Department
7. **`ABILITY_BUDGET_REALLOCATION` (Incident Effect):**
   - *Text:* Gain 2 temporary Shift Hours this turn, but reduce your Maximum Shift by 1 next turn.
   - *Payload:* `EffectType: MODIFY_SHIFT`, `Value: +2`, `SecondaryValue: -1`.
8. **`ABILITY_BUREAUCRATIC_RED_TAPE` (Policy Aura):**
   - *Text:* Opponents must pay 1 additional Shift Hour to cast Incident cards.
   - *Payload:* `EffectType: STATIC_AURA`, `RuleModification: INCIDENT_TAX`.
9. **`ABILITY_MANDATORY_REVIEW` (Onboarding):**
   - *Text:* Return an opposing Character with 3 or less Power to its owner's hand.
   - *Payload:* `EffectType: RETURN_TO_HAND`, `Target: ANY_ENEMY_CHARACTER`.

#### D. Equipment Specialist Department
10. **`ABILITY_HEAVY_FLIGHT_CASE` (Front Desk Guard):**
    - *Text:* Front Desk Guard. Whenever this character takes damage, deal 1 damage to the attacker.
    - *Payload:* `Trigger: ON_DAMAGE_TAKEN`, `EffectType: DAMAGE`, `Value: 1`, `Target: ATTACKER`.
11. **`ABILITY_CAGE_LOCKDOWN` (Incident Effect):**
    - *Text:* Give all friendly characters +2 Stamina and Front Desk Guard this turn.
    - *Payload:* `EffectType: BUFF_STAT`, `Value: 2`, `Target: ALL_FRIENDLY_CHARACTERS`.

#### E. Journalism Department
12. **`ABILITY_EXPOSÉ_REPORT` (Onboarding):**
    - *Text:* Reveal 2 random cards from the opponent's hand. Deal 2 damage to enemy Supervisor.
    - *Payload:* `EffectType: DAMAGE`, `Value: 2`, `Target: ENEMY_SUPERVISOR`.
13. **`ABILITY_PRESS_CREDENTIAL` (Equipment):**
    - *Text:* Equipped character gains +1 Influence and cannot be targeted by enemy Incidents.
    - *Payload:* `KeywordFlags: { auditImmunity: true }`, `InfluenceBonus: +1`.

#### F. Production Department
14. **`ABILITY_ROLLING_SOUND` (Rush):**
    - *Text:* Rush. Whenever this character attacks, friendly characters gain +1 Power this turn.
    - *Payload:* `Trigger: ON_ATTACK`, `EffectType: BUFF_STAT`, `Value: 1`, `Target: ALL_FRIENDLY_CHARACTERS`.
15. **`ABILITY_HOT_LIGHTS` (Incident Effect):**
    - *Text:* Deal 2 damage to ALL characters on the battlefield.
    - *Payload:* `EffectType: DAMAGE`, `Value: 2`, `Target: ALL_CHARACTERS`.

#### G. Problem Solver Department
16. **`ABILITY_ROOT_CAUSE_ANALYSIS` (Onboarding):**
    - *Text:* Silence target character (removes all buffs, debuffs, and card text).
    - *Payload:* `EffectType: SILENCE_CHARACTER`, `Target: ANY_TARGET`.
17. **`ABILITY_WORKAROUND` (Incident Effect):**
    - *Text:* Destroy target Equipment. Draw 1 card.
    - *Payload:* `EffectType: DESTROY_EQUIPMENT`, `SecondaryEffect: DRAW_CARDS`.

#### H. Chaos Agent Department
18. **`ABILITY_UNATTENDED_RODENT` (Clock Out):**
    - *Text:* When this character clocks out, deal 3 damage split randomly among all enemies.
    - *Payload:* `Trigger: ON_CLOCK_OUT`, `EffectType: DAMAGE`, `Value: 3`, `Target: RANDOM_ENEMY`.
19. **`ABILITY_MYSTERY_USB_DRIVE` (Onboarding):**
    - *Text:* 50% chance to draw 2 cards; 50% chance to take 3 Morale damage.
    - *Payload:* `EffectType: CHAOS_ROLL`, `Options: [DRAW_2, MORALE_DAMAGE_3]`.
