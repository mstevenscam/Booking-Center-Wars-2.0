/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Theme & Terminology Decoupled Architecture
 * 
 * Rules:
 * 1. The game engine only processes immutable internal tokens (snake_case).
 * 2. Visual presentation, card copy, and UI strings query the active Theme Dictionary.
 * 3. Changing themes modifies zero balance calculations, combat resolutions, or rules logic.
 * 4. Extensibility: Supports arbitrary user-defined and dynamic theme extensions
 *    (new classifications, departments, equipment, workplace terms) without requiring
 *    any engine code changes or recompilation.
 * 5. Architectural Separation: Cosmetic classifications/departments (e.g. "AV Team",
 *    "Lighting Specialist") are decoupled from mechanical card types (CHARACTER, INCIDENT, GEAR).
 * 6. Storage Stability: Saved cards and decks store only canonical mechanical tokens,
 *    ensuring lifelong forward-compatibility and zero database corruption when themes change.
 */

export type BuiltinThemeId = 'humber_centre' | 'broadcast_stage' | 'corporate_helpdesk';
export type ThemeId = BuiltinThemeId | string;

export interface ThemeDictionary {
  id: ThemeId;
  name: string;
  tagline: string;
  tokens: Record<string, string>;
  // Dynamic cosmetic workplace categories (freely extensible without engine changes)
  departmentLabels?: Record<string, string>;
  equipmentClassLabels?: Record<string, string>;
}

export const THEMES: Record<string, ThemeDictionary> = {
  humber_centre: {
    id: 'humber_centre',
    name: 'Humber Booking Centre (Canonical)',
    tagline: 'The hilarious, high-stress desk struggle at the college equipment cage.',
    tokens: {
      efficiency: 'Efficiency',
      stamina: 'Stamina',
      shift_cost: 'Shift Cost',
      influence: 'Influence',
      morale: 'Morale',
      shift_resource: 'Shift Hours',
      character: 'Character',
      incident: 'Incident',
      gear: 'Gear',
      booking_queue: 'Booking Queue',
      breakroom: 'Breakroom',
      board: 'Front Counter',
      hand: 'Shift Hand',
      deck: 'Shift Roster',
      front_desk_guard: 'Front Desk Guard',
      first_responder: 'First Responder',
      rush: 'Rush',
      infiltration: 'Infiltration',
      action_retire: 'Retire to Breakroom',
      action_reroute_to_hand: 'Re-route to Hand',
      action_discard_to_breakroom: 'Send to Breakroom',
      master_key: 'The Master Key',
      supervisor: 'Shift Supervisor',
      triage_window: 'Queue Triage Window'
    },
    departmentLabels: {
      cage_tech: 'Cage Technicians',
      booking_specialist: 'Booking Specialist',
      media_tech: 'Media Tech Support',
      management: 'Supervisory Staff',
      maintenance: 'Facilities Crew'
    },
    equipmentClassLabels: {
      camera: 'Camera Body & Rig',
      audio: 'Microphone & Mixer',
      lighting: 'Studio Light Grid',
      cables: 'Adapter & XLR Loom'
    }
  },
  broadcast_stage: {
    id: 'broadcast_stage',
    name: 'Broadcast Stage Crew',
    tagline: 'Live television production chaos with director cues and stage managers.',
    tokens: {
      efficiency: 'Output',
      stamina: 'Composure',
      shift_cost: 'Airtime Cost',
      influence: 'Priority',
      morale: 'Broadcast Rating',
      shift_resource: 'Broadcast Credits',
      character: 'Crew Member',
      incident: 'Live Cue',
      gear: 'Studio Equipment',
      booking_queue: 'Production Queue',
      breakroom: 'Green Room',
      board: 'Live Stage',
      hand: 'Rundown',
      deck: 'Call Sheet',
      front_desk_guard: 'Stage Guard',
      first_responder: 'Hot Mic',
      rush: 'On Air',
      infiltration: 'Backstage Pass',
      action_retire: 'Cut to Green Room',
      action_reroute_to_hand: 'Hold in Rundown',
      action_discard_to_breakroom: 'Scrap Segment',
      master_key: 'Executive Producer Override',
      supervisor: 'Show Director',
      triage_window: 'Production Triage Desk'
    },
    departmentLabels: {
      cage_tech: 'Grips & Gaffers',
      booking_specialist: 'Floor Managers',
      media_tech: 'Broadcast Engineers',
      management: 'Executive Producers',
      maintenance: 'Stage Hands'
    },
    equipmentClassLabels: {
      camera: 'Pedestal Studio Cam',
      audio: 'Wireless Lavalier',
      lighting: 'Overhead DMX Rig',
      cables: 'Triax Bundle'
    }
  },
  corporate_helpdesk: {
    id: 'corporate_helpdesk',
    name: 'Corporate Enterprise Helpdesk',
    tagline: 'Ticket queues, escalation protocols, and bureaucratic SLA pressure.',
    tokens: {
      efficiency: 'Throughput',
      stamina: 'Bandwidth',
      shift_cost: 'Budget Cost',
      influence: 'Authority',
      morale: 'SLA Health',
      shift_resource: 'Budget Units',
      character: 'Technician',
      incident: 'Escalation',
      gear: 'Peripherals',
      booking_queue: 'Ticket Queue',
      breakroom: 'Archive',
      board: 'Active Workspace',
      hand: 'Ticket Inbox',
      deck: 'Backlog',
      front_desk_guard: 'Compliance Officer',
      first_responder: 'Urgent Ticket',
      rush: 'Sprint Priority',
      infiltration: 'Root Access',
      action_retire: 'Archive Ticket',
      action_reroute_to_hand: 'Defer to Inbox',
      action_discard_to_breakroom: 'Close as Unresolved',
      master_key: 'Admin Token',
      supervisor: 'Service Delivery Manager',
      triage_window: 'Capacity Triage Protocol'
    },
    departmentLabels: {
      cage_tech: 'L1 Desktop Support',
      booking_specialist: 'Service Dispatchers',
      media_tech: 'Systems Engineers',
      management: 'IT Directors',
      maintenance: 'Facilities Support'
    },
    equipmentClassLabels: {
      camera: 'Webcam & Video Bar',
      audio: 'VoIP Headset',
      lighting: 'Desk Ring Light',
      cables: 'Cat6 Patch Cable'
    }
  }
};

/**
 * Registry for dynamic custom themes added at runtime without modifying engine code
 */
const customThemeRegistry: Map<string, ThemeDictionary> = new Map();

/**
 * Registers an arbitrary dynamic theme (e.g. from user configuration or mods)
 */
export function registerCustomTheme(theme: ThemeDictionary): void {
  customThemeRegistry.set(theme.id, theme);
}

/**
 * Retrieves a theme dictionary by ID (builtin or dynamic)
 */
export function getTheme(themeId: ThemeId = 'humber_centre'): ThemeDictionary {
  if (customThemeRegistry.has(themeId)) {
    return customThemeRegistry.get(themeId)!;
  }
  return THEMES[themeId] || THEMES.humber_centre;
}

/**
 * Resolves any token for a given theme, with fallback to humber_centre and then raw token
 */
export function resolveToken(token: string, themeId: ThemeId = 'humber_centre'): string {
  const theme = getTheme(themeId);
  if (theme.tokens && theme.tokens[token]) {
    return theme.tokens[token];
  }
  // Fallback to canonical humber_centre
  const canonical = THEMES.humber_centre;
  if (canonical.tokens[token]) {
    return canonical.tokens[token];
  }
  return token;
}

/**
 * Resolves a cosmetic department label dynamically
 */
export function resolveDepartmentLabel(deptKey: string, themeId: ThemeId = 'humber_centre'): string {
  const theme = getTheme(themeId);
  return theme.departmentLabels?.[deptKey] || THEMES.humber_centre.departmentLabels?.[deptKey] || deptKey;
}

/**
 * Resolves a cosmetic equipment class label dynamically
 */
export function resolveEquipmentLabel(equipKey: string, themeId: ThemeId = 'humber_centre'): string {
  const theme = getTheme(themeId);
  return theme.equipmentClassLabels?.[equipKey] || THEMES.humber_centre.equipmentClassLabels?.[equipKey] || equipKey;
}

/**
 * Validates card payload data structure
 * Ensures cards use immutable mechanical types and do not bind to theme-specific labels.
 */
export function validateCardSchemaForThemeIndependence(card: {
  id: string;
  type: 'character' | 'incident' | 'gear'; // Mechanical types ONLY
  shiftCost: number;
  efficiency?: number;
  stamina?: number;
  influence: number;
  departmentKey?: string; // Pure cosmetic key
  equipmentClassKey?: string; // Pure cosmetic key
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const validTypes = ['character', 'incident', 'gear'];
  if (!validTypes.includes(card.type)) {
    errors.push(`Invalid mechanical type '${card.type}'. Must be one of: ${validTypes.join(', ')}`);
  }
  if (typeof card.shiftCost !== 'number' || card.shiftCost < 1 || card.shiftCost > 10) {
    errors.push(`Shift cost must be integer between 1 and 10, got ${card.shiftCost}`);
  }
  if (typeof card.influence !== 'number' || card.influence < 1 || card.influence > 4) {
    errors.push(`Influence must be integer between 1 and 4, got ${card.influence}`);
  }
  return { valid: errors.length === 0, errors };
}
