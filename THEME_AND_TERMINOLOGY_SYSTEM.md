# THEME & TERMINOLOGY SYSTEM SPECIFICATION
## Decoupled Architecture, Canonical Internal Identifiers, and Dynamic Theme Extensibility

---

### 1. Decoupled Architecture Principle

The core gameplay engine (`/src/engine/`) has **ZERO hardcoded dependency** on visual theme labels, humor, or workplace flavor text.
All calculations, state mutations, combat resolutions, and card evaluations operate strictly on **immutable internal snake_case identifiers**.

```
┌────────────────────────────────────────────────────────┐
│           CORE GAME ENGINE & RULES (src/engine/)       │
│  Operates strictly on immutable internal tokens:       │
│  - shift_cost, efficiency, stamina, influence          │
│  - character, incident, gear                           │
│  - front_desk_guard, booking_queue, breakroom          │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│        CENTRAL THEME DICTIONARY (src/engine/theme.ts)  │
│  Resolves internal tokens to user-facing strings       │
│  Supports runtime registration of arbitrary custom     │
│  workplace themes without engine recompilation         │
└───────────────────────────┬────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ HUMBER CENTRE │   │BROADCAST STAGE│   │  CORP HELPDESK│
│ (Canonical)   │   │(Production)   │   │  (Enterprise) │
│ - Shift Cost  │   │ - Airtime Cost│   │ - Budget Cost │
│ - Efficiency  │   │ - Output      │   │ - Throughput  │
│ - Stamina     │   │ - Composure   │   │ - Bandwidth   │
│ - Character   │   │ - Crew Member │   │ - Technician  │
│ - Breakroom   │   │ - Green Room  │   │ - Archive     │
└───────────────┘   └───────────────┘   └───────────────┘
```

---

### 2. Standardized Internal Identifiers Dictionary

The following table establishes the immutable mechanical identifiers and their exact mappings across all three built-in themes:

| Category | Internal Mechanical ID | Humber Booking Centre (Canonical) | Broadcast Stage Crew | Corporate Helpdesk |
| :--- | :--- | :--- | :--- | :--- |
| **Attributes** | `efficiency` | **Efficiency** | Output | Throughput |
| | `stamina` | **Stamina** | Composure | Bandwidth |
| | `shift_cost` | **Shift Cost** | Airtime Cost | Budget Cost |
| | `influence` | **Influence** | Priority | Authority |
| **Resources** | `morale` | **Morale** | Broadcast Rating | SLA Health |
| | `shift_resource` | **Shift Hours** | Broadcast Credits | Budget Units |
| | `master_key` | **The Master Key** | Producer Override | Admin Token |
| **Card Types** | `character` | **Character** | Crew Member | Technician |
| | `incident` | **Incident** | Live Cue | Escalation |
| | `gear` | **Gear** | Studio Equipment | Peripherals |
| **Zones** | `booking_queue` | **Booking Queue** | Production Queue | Ticket Queue |
| | `breakroom` | **Breakroom** | Green Room | Archive |
| | `board` | **Front Counter** | Live Stage | Active Workspace |
| | `hand` | **Shift Hand** | Rundown | Ticket Inbox |
| | `deck` | **Shift Roster** | Call Sheet | Backlog |
| **Keywords** | `front_desk_guard` | **Front Desk Guard** | Stage Guard | Compliance Officer |
| | `first_responder` | **First Responder** | Hot Mic | Urgent Ticket |
| | `rush` | **Rush** | On Air | Sprint Priority |
| | `infiltration` | **Infiltration** | Backstage Pass | Root Access |
| **Queue Overflow**| `action_retire` | **Retire to Breakroom** | Cut to Green Room | Archive Ticket |
| | `action_reroute_to_hand` | **Re-route to Hand** | Hold in Rundown | Defer to Inbox |
| | `action_discard_to_breakroom`| **Send to Breakroom** | Scrap Segment | Close as Unresolved |
| **Entities** | `supervisor` | **Shift Supervisor** | Show Director | Delivery Manager |
| | `triage_window` | **Queue Triage Window** | Production Triage Desk | Capacity Triage Protocol |

---

### 3. Dynamic Theme Extensibility & Separation of Concerns

To support expansions, community modifications, or user customization without touching gameplay code:

#### A. Dynamic Theme Registration
Themes can be injected at runtime into `src/engine/theme.ts` via `registerCustomTheme(theme: ThemeDictionary)`:
```typescript
registerCustomTheme({
  id: 'orbital_logistics',
  name: 'Orbital Logistics Station',
  tagline: 'Deep space cargo dispatch and airlock maintenance.',
  tokens: {
    efficiency: 'Thruster Output',
    stamina: 'Hull Integrity',
    shift_cost: 'Reactor Energy',
    booking_queue: 'Decompression Chamber',
    breakroom: 'Cryo Sleep Pods'
  },
  departmentLabels: {
    cage_tech: 'Engineering Bay Techs',
    booking_specialist: 'Docking Dispatchers'
  }
});
```

#### B. Architectural Separation: Cosmetic Categories vs. Mechanical Card Types
- **Mechanical Card Types:** Strictly constrained to three engine primitives: `character`, `incident`, and `gear`. These drive engine behavior, targeting, and combat logic.
- **Cosmetic Classifications:** Department labels (e.g. *"Cage Technicians"*, *"Audio Team"*, *"IT Dispatchers"*) and Equipment classes (e.g. *"Camera Body"*, *"Microphone"*) are pure cosmetic metadata. They have zero bearing on rules or balance equations and map freely across themes.

#### C. Lifelong Storage & Serialization Stability
- Saved card collections, custom decks, and replay logs **store only immutable mechanical tokens** (`character`, `incident`, `gear`, `shiftCost: 4`, `influence: 2`, `stamina: 5`).
- The database never stores theme-specific display strings.
- A player can switch themes or load a newly installed theme at any time; cards and decks remain 100% valid with zero risk of database corruption or schema migration failures.

---

### 4. Elimination of Non-Canonical Terminology

In earlier draft documentation, certain legacy and generic TCG terms appeared inconsistently. The following corrections are now locked across the entire codebase:

1. **"Minions" $\rightarrow$ "Characters":**
   - The generic card game term "minion" is strictly banned in all documentation and player-facing copy.
   - Internal token: `character`. Canonical name: **Character**.
2. **"Power" $\rightarrow$ "Efficiency":**
   - The term "Power" is replaced with **Efficiency** in the Humber theme.
   - Internal token: `efficiency`.
3. **"Mana" / "Energy" $\rightarrow$ "Shift Cost" / "Shift Hours":**
   - The energy resource is strictly **Shift Cost** (cost to play) and **Shift Hours** (available resource pool).
   - Internal tokens: `shift_cost` and `shift_resource`.
4. **"Graveyard" / "Discard" $\rightarrow$ "Breakroom":**
   - Characters do not "die" or enter a "graveyard"; they **clock out** and enter the **Breakroom**.
   - Internal token: `breakroom`.

---

### 5. Final Sign-Off Section

#### A. Rules Locked and Ready for Implementation
- Decoupled theme dictionary architecture in `src/engine/theme.ts`.
- Complete mapping for 3 built-in themes (Humber Centre, Broadcast Stage, Corporate Helpdesk).
- Dynamic theme registration system (`registerCustomTheme`).
- Strict decoupling of cosmetic department labels from mechanical card types.
- Storage schema validation ensuring cards serialize only immutable mechanical tokens.

#### B. Rules Intentionally Left Configurable for Phase 2 Testing
- User-selectable default theme toggle in the UI settings menu.
- Custom cosmetic department badges on card frames.

#### C. Features That Are Documented But Not Implemented
- Sound effect theme variations (e.g. walkie-talkie beeps for Humber vs broadcast director cues).
- Cosmetic theme packs downloadable as JSON bundles.

#### D. Remaining Questions Requiring Stakeholder Approval
- None. Decoupling and dynamic extension patterns are verified with automated tests in `src/engine/tests/theme.test.ts`.

#### E. Phase 1B Approval Readiness
- **STATUS: APPROVED & LOCKED FOR PHASE 2 ENGINE ARCHITECTURE.**
