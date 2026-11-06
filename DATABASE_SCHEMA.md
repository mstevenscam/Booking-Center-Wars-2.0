# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## DATABASE SCHEMA & DATA PERSISTENCE SPECIFICATION
**Version:** 1.0.0-DB  
**Technology:** Google Cloud Firestore (NoSQL Document Store) & Firebase Storage  

---

### 1. COLLECTION ARCHITECTURE OVERVIEW
The database stores three primary tiers of data:
1. **Catalog Domain:** Approved game cards, keywords, and balance definitions (read-heavy, admin-write).
2. **Workshop & Archive Domain:** Legacy card photographs (front/back), OCR transcriptions, and pending AI card design proposals.
3. **Player Domain:** User-crafted decks, custom presets, and local/shared match histories.

```
firestore-root
  ├── cards/ {cardId}                       // Approved tournament cards
  ├── raw_cards/ {rawCardId}                 // Ingested original physical scans
  ├── workshop_proposals/ {proposalId}       // AI proposals awaiting approval
  ├── decks/ {deckId}                       // Constructed 30-card decks
  └── match_history/ {matchId}               // Local match logs & balance telemetry
```

---

### 2. DETAILED COLLECTION SCHEMAS

#### 2.1 Collection: `cards` (Playable Cards)
- **Path:** `/cards/{cardId}`
- **Security:** Public Read, Admin Write Only (`request.auth.token.admin == true`).
```json
{
  "cardId": "bw-tech-014",
  "name": "Senior AV Specialist Dave",
  "cardType": "CHARACTER",
  "rarity": "SUPERVISOR",
  "shiftCost": 4,
  "stats": {
    "power": 3,
    "stamina": 5,
    "currentStamina": 5,
    "influence": 2
  },
  "affiliations": ["Technician", "Problem Solver"],
  "abilities": [
    {
      "abilityId": "ABILITY_GAFFER_TAPE_PATCH",
      "name": "Emergency Soldering",
      "trigger": "ON_PLAY",
      "targetFilter": "ANY_FRIENDLY_CHARACTER",
      "effectType": "HEAL_STAMINA",
      "primaryValue": 3,
      "customDescription": "Onboarding: Restore 3 Stamina to target damaged character."
    }
  ],
  "artworkUrl": "https://storage.googleapis.com/.../cards/bw-tech-014.webp",
  "flavorQuote": "\"If gaffer tape can't fix it, it's not broken enough.\"",
  "isOfficial": true,
  "approvedAt": "2026-11-01T12:00:00Z",
  "approvedBy": "admin_uid_mstevens"
}
```

#### 2.2 Collection: `raw_cards` (Original Physical Card Archive)
- **Path:** `/raw_cards/{rawCardId}`
- **Purpose:** Preserves historical scans and lore intact without modification.
```json
{
  "rawCardId": "raw-2019-dave-01",
  "frontImageUrl": "gs://.../raw_scans/dave_2019_front.jpg",
  "backImageUrl": "gs://.../raw_scans/dave_2019_back.jpg",
  "originalTitle": "Super Dave: Master of the Patch Bay",
  "originalDescription": "Legend has it he once routed an entire broadcast through a single RCA adapter.",
  "originalAbilities": "Can untangle 50ft of snake cable in under 10 seconds.",
  "originalHumorTags": ["InsideJoke2019", "PatchBay", "HumberNorth"],
  "honoredColleague": "Dave S.",
  "uploadTimestamp": "2026-11-01T10:15:00Z",
  "status": "PROCESSED"
}
```

#### 2.3 Collection: `workshop_proposals` (AI Proposals)
- **Path:** `/workshop_proposals/{proposalId}`
- **Purpose:** Stores Gemini analysis and proposed playable stats prior to admin approval.
```json
{
  "proposalId": "prop-dave-2019",
  "rawCardId": "raw-2019-dave-01",
  "status": "PENDING_REVIEW", // PENDING_REVIEW | APPROVED | REJECTED
  "suggestedName": "Dave, Patch Bay Maestro",
  "suggestedCardType": "CHARACTER",
  "suggestedRarity": "SUPERVISOR",
  "suggestedShiftCost": 4,
  "suggestedStats": {
    "power": 3,
    "stamina": 5,
    "influence": 2
  },
  "suggestedAffiliations": ["Technician"],
  "suggestedAbilities": [
    {
      "name": "Cable Routing",
      "trigger": "ON_PLAY",
      "effectType": "BUFF_STAT",
      "primaryValue": 1
    }
  ],
  "aiRationale": "Balanced based on 4-cost vanilla budget (9 stats total): 3 Power + 5 Stamina + 2 Influence (worth 1.5 stat points) matches standard curve.",
  "createdAt": "2026-11-01T10:16:00Z"
}
```

#### 2.4 Collection: `decks` (Constructed Decks)
- **Path:** `/decks/{deckId}`
```json
{
  "deckId": "deck-starter-admin-control",
  "deckName": "Bureaucratic Lockdown",
  "ownerId": "local_guest_or_user_id",
  "leadAffiliations": ["Administration", "Booking Specialist"],
  "cardList": [
    { "cardId": "bw-tech-014", "count": 2 },
    { "cardId": "bw-admin-002", "count": 2 }
  ],
  "totalCardCount": 30,
  "isValid": true,
  "updatedAt": "2026-11-01T14:30:00Z"
}
```

---

### 3. SECURITY RULES SPECIFICATION (`firestore.rules`)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Playable cards are readable by everyone, editable only by admins
    match /cards/{cardId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    
    // Raw card archive & workshop proposals are strictly admin access
    match /raw_cards/{rawCardId} {
      allow read, write: if request.auth != null && request.auth.token.admin == true;
    }
    match /workshop_proposals/{proposalId} {
      allow read, write: if request.auth != null && request.auth.token.admin == true;
    }
    
    // User decks can be read/written by their owner
    match /decks/{deckId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.ownerId;
      allow create: if request.auth != null;
    }
  }
}
```
