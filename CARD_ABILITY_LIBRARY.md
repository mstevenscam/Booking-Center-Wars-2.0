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

### 3. OFFICIAL 25 CANONICAL ABILITIES CATALOG & MAPPING

The 25 official player-facing ability names mapped to their canonical internal engine definitions:

#### A. Offensive Abilities
1. **`ABILITY_SHORT_CIRCUIT` — Official Name: `Spotify Take over`**
   - *Action:* Deal damage to an opposing character.
   - *Payload:* `EffectType: DAMAGE`, `PrimaryValue: 3`, `TargetFilter: ANY_ENEMY_CHARACTER`, `Trigger: ON_PLAY`.
2. **`ABILITY_WORKAROUND` — Official Name: `Gear Return`**
   - *Action:* Destroy or disable an opposing Gear or Equipment card.
   - *Payload:* `EffectType: SILENCE_CHARACTER`, `PrimaryValue: 0`, `TargetFilter: ANY_ENEMY_CHARACTER`, `Trigger: ON_PLAY`.
3. **`ABILITY_ROLLING_SOUND` — Official Name: `Pin Over ride`**
   - *Action:* Gain additional offensive strength for one turn.
   - *Payload:* `EffectType: BUFF_STAT`, `PrimaryValue: 1`, `TargetFilter: ALL_FRIENDLY_CHARACTERS`, `Duration: UNTIL_END_OF_TURN`, `Trigger: ON_ATTACK`.
4. **`ABILITY_HOT_LIGHTS` — Official Name: `Cap Stone Order`**
   - *Action:* Deal damage to multiple characters.
   - *Payload:* `EffectType: DAMAGE`, `PrimaryValue: 2`, `TargetFilter: ALL_CHARACTERS`, `Trigger: ON_PLAY`.
5. **`ABILITY_DISCIPLINARY_DISMISSAL` — Official Name: `Shift Exchange`**
   - *Action:* Remove an opposing character from the battlefield.
   - *Payload:* `EffectType: DESTROY_CHARACTER`, `PrimaryValue: 0`, `TargetFilter: ANY_ENEMY_CHARACTER`, `Trigger: ON_PLAY`.
6. **`ABILITY_UNATTENDED_RODENT` — Official Name: `NO shift coverage`**
   - *Action:* When this character clocks out, damage a random opponent.
   - *Payload:* `EffectType: DAMAGE`, `PrimaryValue: 2`, `TargetFilter: RANDOM_ENEMY_CHARACTER`, `Trigger: ON_CLOCK_OUT`.

#### B. Defensive Abilities
7. **`ABILITY_FRONT_DESK_GUARD` — Official Name: `Staging Order 1`**
   - *Action:* Opponents must deal with this character before attacking protected teammates.
   - *Payload:* `EffectType: BUFF_STAT`, `PrimaryValue: 0`, `TargetFilter: SELF`, `Trigger: START_OF_SHIFT`.
8. **`ABILITY_DIVINE_LANYARD` — Official Name: `Successful scan`**
   - *Action:* Block the first incoming damage.
   - *Payload:* `EffectType: BUFF_STAT`, `PrimaryValue: 0`, `TargetFilter: SELF`, `Trigger: ON_DEPLOY`.
9. **`ABILITY_HEAVY_FLIGHT_CASE` — Official Name: `Rapid Return`**
   - *Action:* Return damage to an attacker.
   - *Payload:* `EffectType: DAMAGE`, `PrimaryValue: 1`, `TargetFilter: ATTACKER`, `Trigger: ON_DAMAGE_TAKEN`.
10. **`ABILITY_CAGE_LOCKDOWN` — Official Name: `Timmy Run`**
    - *Action:* Temporarily increase friendly characters' Health.
    - *Payload:* `EffectType: BUFF_STAT`, `PrimaryValue: 0`, `SecondaryValue: 2`, `TargetFilter: ALL_FRIENDLY_CHARACTERS`, `Duration: UNTIL_END_OF_TURN`, `Trigger: ON_DEPLOY`.
11. **`ABILITY_AUDIT_IMMUNITY` — Official Name: `Inventory Check`**
    - *Action:* Protect a character from targeted opposing abilities.
    - *Payload:* `EffectType: BUFF_STAT`, `PrimaryValue: 0`, `TargetFilter: SELF`, `Trigger: ON_DEPLOY`.
12. **`ABILITY_COFFEE_BREAK` — Official Name: `Red bull`**
    - *Action:* Recover Health at the beginning of a Shift if undamaged.
    - *Payload:* `EffectType: HEAL_STAMINA`, `PrimaryValue: 2`, `TargetFilter: SELF`, `Trigger: START_OF_SHIFT`.

#### C. Support Abilities
13. **`ABILITY_GAFFER_TAPE_PATCH` (also `ABILITY_DIRECT_REPAIR`) — Official Name: `Gaffer Tape Patch`**
    - *Action:* Restore Health to a friendly character.
    - *Payload:* `EffectType: HEAL_STAMINA`, `PrimaryValue: 3`, `TargetFilter: ANY_FRIENDLY_CHARACTER`, `Trigger: ON_DEPLOY`.
14. **`ABILITY_FIELD_PROMOTION` — Official Name: `Extra Pin`**
    - *Action:* Permanently improve a friendly character's attributes.
    - *Payload:* `EffectType: BUFF_STAT`, `PrimaryValue: 1`, `SecondaryValue: 1`, `Duration: PERMANENT`, `TargetFilter: ANY_FRIENDLY_CHARACTER`, `Trigger: ON_DEPLOY`.
15. **`ABILITY_BENCH_TEST` — Official Name: `Troubleshooting`**
    - *Action:* Improve a random friendly character.
    - *Payload:* `EffectType: BUFF_STAT`, `PrimaryValue: 1`, `SecondaryValue: 1`, `Duration: PERMANENT`, `TargetFilter: RANDOM_FRIENDLY_CHARACTER`, `Trigger: START_OF_SHIFT`.
16. **`ABILITY_SUPERVISOR_COUNSEL` — Official Name: `Happy Vicky`**
    - *Action:* Restore your Supervisor's Morale.
    - *Payload:* `EffectType: HEAL_MORALE`, `PrimaryValue: 4`, `TargetFilter: FRIENDLY_SUPERVISOR`, `Trigger: ON_DEPLOY`.
17. **`ABILITY_EXPRESS_CHECKOUT` — Official Name: `Express Checkout`**
    - *Action:* Draw an additional card.
    - *Payload:* `EffectType: DRAW_CARDS`, `PrimaryValue: 1`, `TargetFilter: SELF`, `Trigger: ON_DEPLOY`.
18. **`ABILITY_FAST_TRACK` — Official Name: `Fast Track`**
    - *Action:* Reduce the remaining time of your own Booking Queue tickets.
    - *Payload:* `EffectType: DISRUPT_QUEUE`, `PrimaryValue: -1`, `TargetFilter: ALL_FRIENDLY_QUEUE`, `Trigger: ON_DEPLOY`.
19. **`ABILITY_EMERGENCY_FUNDING` (also `ABILITY_BUDGET_REALLOCATION`) — Official Name: `Shift Help`**
    - *Action:* Gain temporary Shift resources.
    - *Payload:* `EffectType: MODIFY_SHIFT`, `PrimaryValue: 1`, `TargetFilter: SELF`, `Trigger: ON_PLAY`.

#### D. Disruption Abilities
20. **`ABILITY_RESERVATION_HOLD` — Official Name: `Pending Approval`**
    - *Action:* Delay an opposing Booking Queue ticket.
    - *Payload:* `EffectType: DISRUPT_QUEUE`, `PrimaryValue: 1`, `TargetFilter: PENDING_QUEUE_TICKET`, `Trigger: ON_PLAY`.
21. **`ABILITY_MANDATORY_REVIEW` — Official Name: `Snow Day`**
    - *Action:* Return an opposing character to its owner's hand.
    - *Payload:* `EffectType: RETURN_TO_HAND`, `PrimaryValue: 0`, `TargetFilter: ANY_ENEMY_CHARACTER`, `Trigger: ON_PLAY`.
22. **`ABILITY_ROOT_CAUSE_ANALYSIS` — Official Name: `Pin Access Removed`**
    - *Action:* Remove an opposing character's abilities and bonuses.
    - *Payload:* `EffectType: SILENCE_CHARACTER`, `PrimaryValue: 0`, `TargetFilter: ANY_ENEMY_CHARACTER`, `Trigger: ON_DEPLOY`.
23. **`ABILITY_BUREAUCRATIC_RED_TAPE` — Official Name: `Late Fines`**
    - *Action:* Make selected opposing actions more expensive.
    - *Payload:* `EffectType: MODIFY_SHIFT`, `PrimaryValue: 0`, `TargetFilter: SELF`, `Trigger: START_OF_SHIFT`.
24. **`ABILITY_EXPOSÉ_REPORT` — Official Name: `Boss Dirt`**
    - *Action:* Reveal opposing information and potentially damage their Supervisor.
    - *Payload:* `EffectType: DAMAGE`, `PrimaryValue: 2`, `TargetFilter: ENEMY_SUPERVISOR`, `Trigger: ON_DEPLOY`.
25. **`ABILITY_MYSTERY_USB_DRIVE` — Official Name: `Random Spotify Playlist`**
    - *Action:* Trigger a random beneficial or harmful outcome.
    - *Payload:* `EffectType: DRAW_CARDS`, `PrimaryValue: 1`, `TargetFilter: SELF`, `Trigger: ON_DEPLOY`.

---

### 4. IMPLEMENTATION STATUS & DOCUMENTED MECHANICAL LIMITATIONS

Per the Official Ability Renaming Approval, player-facing names and stable internal IDs are finalized across all 25 canonical abilities. In order to preserve engine stability and card balance, no new gameplay mechanics were introduced in this naming milestone. The following 8 abilities have documented mechanical limitations in the current simulation engine and will be addressed in a future dedicated gameplay milestone:

1. **Gear Return (`ABILITY_WORKAROUND`)**
   - *Official Action:* Destroy or disable an opposing Gear or Equipment card.
   - *Current Engine Limitation:* The current simulation engine does not support equipment attachment slots on battlefield characters or a `DESTROY_EQUIPMENT` effect type. It currently executes `SILENCE_CHARACTER` against `ANY_ENEMY_CHARACTER`.

2. **Cap Stone Order (`ABILITY_HOT_LIGHTS`)**
   - *Official Action:* Deal damage to multiple characters.
   - *Current Engine Limitation:* In `resolveAbilityEffect`, the `DAMAGE` handler supports single targets (character or supervisor). An `ALL_CHARACTERS` multi-target iteration loop is not yet implemented in the resolution pipeline.

3. **Successful scan (`ABILITY_DIVINE_LANYARD`)**
   - *Official Action:* Block the first incoming damage.
   - *Current Engine Limitation:* The engine lacks an active damage-nullification/shield state in `combat.ts`. Damage calculations do not currently check or consume a `Divine Shield` charge.

4. **Inventory Check (`ABILITY_AUDIT_IMMUNITY`)**
   - *Official Action:* Protect a character from targeted opposing abilities.
   - *Current Engine Limitation:* The engine does not yet evaluate an untargetable / spell-ward flag within `isTargetLegal` when resolving enemy abilities or incident targeting.

5. **Red bull (`ABILITY_COFFEE_BREAK`)**
   - *Official Action:* Recover Health at the beginning of a Shift if undamaged.
   - *Current Engine Limitation:* Restores 2 Stamina at the start of shift unconditionally. The engine does not yet track a "damaged this round / prior turn" history flag on character cards.

6. **Late Fines (`ABILITY_BUREAUCRATIC_RED_TAPE`)**
   - *Official Action:* Make selected opposing actions more expensive.
   - *Current Engine Limitation:* Resolves `MODIFY_SHIFT` with value 0. The engine does not yet support an ongoing cost-taxing aura or incident cost modifier pipeline.

7. **Boss Dirt (`ABILITY_EXPOSÉ_REPORT`)**
   - *Official Action:* Reveal opposing information and potentially damage their Supervisor.
   - *Current Engine Limitation:* Resolves 2 damage to the enemy supervisor, but the engine currently lacks hand-inspection and hidden-information reveal mechanics.

8. **Random Spotify Playlist (`ABILITY_MYSTERY_USB_DRIVE`)**
   - *Official Action:* Trigger a random beneficial or harmful outcome.
   - *Current Engine Limitation:* Currently resolves as `DRAW_CARDS` (1 card). A dual-outcome beneficial/harmful random table roll has not yet been hooked into the engine resolution pipeline.

