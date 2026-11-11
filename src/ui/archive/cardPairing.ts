/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Deterministic Card Front/Back Recognition and Pairing Engine
 * 
 * Rules & Classification Policy:
 * 1. Matching is strictly case-insensitive.
 * 2. Back-side suffix pattern recognition:
 *    - Recognized back suffixes: '_back', '-back', '.back' (case-insensitive).
 *    - Suffix is stripped to compute the normalized shared card base identity.
 *    - Explicit front suffixes: '_front', '-front', '.front' (stripped to compute base).
 * 3. Conservative side classification:
 *    - Files with explicit '_front', '-front', '.front' suffixes are classified as FRONT.
 *    - Files with explicit '_back', '-back', '.back' suffixes are classified as BACK.
 *    - Files without explicit suffixes are NOT automatically assumed to be FRONT.
 *    - Generic filenames (e.g. 'scan.png', 'document.jpg', 'image_001.png', 'untitled.webp'),
 *      purely numeric names, symbol/punctuation prefixed names, and ambiguous unclassified names
 *      are conservatively classified as UNKNOWN.
 *    - Files with recognized card prefixes ('hockeycard_', 'card_', 'char_', 'character_',
 *      'booking_', 'bw_', 'player_', 'staff_', 'tech_'), year-prefixed archive files
 *      (e.g. '1999_Dave_Maestro.jpg'), or structured multi-token character names
 *      (e.g. 'Dave_Rig_Tech.JPG') are recognized as FRONT.
 *    - Any file failing confident card recognition defaults conservatively to UNKNOWN.
 * 4. Exact matching: Two files pair if and only if their normalized base identities match exactly.
 * 5. Supports common extensions: .jpg, .jpeg, .png, .webp, .tif, .tiff, .psd (case-insensitive).
 *    Files do NOT require matching extensions.
 * 6. Whitespace is safely trimmed.
 * 7. Never pairs files based only on loose, fuzzy, or partial filename similarity.
 * 8. Never automatically pairs UNKNOWN or ambiguous assets.
 * 9. Flags ambiguous matches (e.g. multiple candidate backs or conflicting candidates) as AMBIGUOUS.
 * 10. Only CARD_ARTWORK classification is eligible for automatic pairing (PHOTOSHOP_TEMPLATE and OTHER_ASSET are excluded).
 */

import { CardAssetSide, ArchiveClassification } from './types';

export interface CardFilenameAnalysis {
  originalFilename: string;
  normalizedBaseName: string;
  side: CardAssetSide;
  extension: string;
}

export interface CandidatePair<T> {
  cardBaseId: string;
  front: T | null;
  back: T | null;
  status: 'CONFIRMED' | 'FRONT_ONLY' | 'BACK_ONLY' | 'AMBIGUOUS' | 'UNKNOWN_SIDE';
  candidates: T[];
  reason?: string;
}

/**
 * Generic keywords indicating scanning artifacts, utility documents, or ambiguous files
 * that must NEVER be silently classified as card fronts.
 */
export const GENERIC_FILENAME_KEYWORDS = new Set([
  'scan',
  'scans',
  'scanner',
  'document',
  'doc',
  'docs',
  'image',
  'img',
  'photo',
  'picture',
  'pic',
  'file',
  'page',
  'pages',
  'untitled',
  'temp',
  'test',
  'output',
  'preview',
  'sample',
  'draft',
  'download',
  'upload',
  'capture',
  'screenshot',
  'raw',
  'new',
  'copy',
  'paper',
  'sheet',
  'print',
  'export',
  'import',
  'backup',
  'archive',
  'asset',
  'mystery',
  'unknown',
  'ambiguous',
]);

/**
 * Well-established card and roster prefixes used throughout Booking Wars archive collections.
 */
export const RECOGNIZED_CARD_PREFIXES = [
  'hockeycard_',
  'card_',
  'char_',
  'character_',
  'booking_',
  'bw_',
  'player_',
  'staff_',
  'tech_',
];

/**
 * Known character and persona identifiers in the Booking Wars universe.
 */
export const KNOWN_ROSTER_PERSONAS = new Set([
  'paige',
  'griff',
  'dave',
  'sarah',
  'maestro',
  'rig_tech',
  'corinne',
  'marcus',
  'tanya',
  'valerie',
  'cable',
]);

/**
 * Strips file extension from a filename case-insensitively.
 */
export function stripExtension(filename: string): { base: string; ext: string } {
  const trimmed = filename.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0) {
    return { base: trimmed, ext: '' };
  }
  return {
    base: trimmed.substring(0, lastDot),
    ext: trimmed.substring(lastDot).toLowerCase(),
  };
}

/**
 * Evaluates whether a normalized base name represents a generic document or ambiguous scan.
 */
function isGenericOrAmbiguousFilename(normalizedBase: string, trimmedBase: string): boolean {
  // 1. Starts with non-alphanumeric character, punctuation, or symbol
  if (!/^[a-z0-9]/i.test(trimmedBase) || /^[_\W]+/.test(trimmedBase)) {
    return true;
  }

  // 2. Purely numeric (e.g. "001", "12345", "2021")
  if (/^[\d\s_-]+$/.test(normalizedBase)) {
    return true;
  }

  // 3. Very short / unidentifiable tokens
  if (normalizedBase.length < 3) {
    return true;
  }

  // 4. Exact generic file keyword
  if (GENERIC_FILENAME_KEYWORDS.has(normalizedBase)) {
    return true;
  }

  // 5. Generic keyword followed by numbers or separator + numbers (e.g. "scan_001", "document-1", "image12")
  const genericPattern = /^(scan|scans|document|doc|docs|image|img|photo|picture|pic|file|page|untitled|temp|test|output|preview|sample|draft)[\s_#-]*\d+$/i;
  if (genericPattern.test(normalizedBase)) {
    return true;
  }

  // 6. Explicitly ambiguous or mystery markers
  if (normalizedBase.includes('ambiguous') || normalizedBase.includes('mystery') || normalizedBase.includes('unknown')) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether a filename without an explicit front/back suffix exhibits confident
 * collectible card or roster entity conventions.
 */
function isConfidentCardName(normalizedBase: string, trimmedBase: string): boolean {
  const lowerTrimmed = trimmedBase.toLowerCase();

  // 1. Established card prefix (e.g. "hockeycard_PAIGE", "card_001", "bw_dave")
  for (const prefix of RECOGNIZED_CARD_PREFIXES) {
    if (lowerTrimmed.startsWith(prefix) && lowerTrimmed.length > prefix.length) {
      return true;
    }
  }

  // 2. Historical archive year prefix (e.g. "1999_Dave_Maestro", "2021_Sarah_Cable_Scan")
  if (/^(19|20)\d{2}[\s_-]+[a-z0-9]/i.test(trimmedBase)) {
    return true;
  }

  // 3. Known canonical roster persona name (e.g. "paige", "griff", "sarah")
  if (KNOWN_ROSTER_PERSONAS.has(normalizedBase)) {
    return true;
  }

  // 4. Structured multi-token persona / card name (e.g. "Dave_Rig_Tech", "Paige_Roster")
  // Must contain a recognized roster persona or card entity keyword.
  const tokens = trimmedBase.split(/[\s_-]+/).filter(Boolean);
  if (tokens.length >= 2) {
    const hasPersona = tokens.some(t => KNOWN_ROSTER_PERSONAS.has(t.toLowerCase()));
    const hasCardTerm = tokens.some(t => ['card', 'cards', 'hockeycard', 'roster'].includes(t.toLowerCase()));
    if (hasPersona || hasCardTerm) {
      return true;
    }
  }

  return false;
}

/**
 * Deterministically analyzes a filename to extract side and normalized card identity.
 * 
 * Rules:
 * - Explicit back suffix ('_back', '-back', '.back') -> BACK
 * - Explicit front suffix ('_front', '-front', '.front') -> FRONT
 * - Without explicit suffix:
 *   - Generic files ('scan.png', 'document.jpg', etc.) -> UNKNOWN
 *   - Ambiguous or non-card names -> UNKNOWN
 *   - Confident card names (prefixes like 'hockeycard_', multi-token personas) -> FRONT
 *   - Everything else -> UNKNOWN (conservative default)
 * 
 * Example:
 * - "hockeycard_PAIGE.png" -> normalized: "hockeycard_paige", side: "FRONT"
 * - "hockeycard_paige_back.png" -> normalized: "hockeycard_paige", side: "BACK"
 * - "scan.png" -> normalized: "scan", side: "UNKNOWN"
 * - "document.jpg" -> normalized: "document", side: "UNKNOWN"
 */
export function analyzeCardFilename(filename: string): CardFilenameAnalysis {
  const { base, ext } = stripExtension(filename);
  const trimmedBase = base.trim();

  // Pattern A: Explicit Back Suffix
  // Matches: "_back", "-back", ".back", "_Back", "-BACK", etc.
  const backSuffixRegex = /^(.*?)[\s_-]+back$/i;
  const backDotRegex = /^(.*?)\.back$/i;

  const backSuffixMatch = trimmedBase.match(backSuffixRegex) || trimmedBase.match(backDotRegex);
  if (backSuffixMatch) {
    const rawRoot = backSuffixMatch[1].trim();
    const normalized = rawRoot.toLowerCase().replace(/[\s-]+/g, '_');
    return {
      originalFilename: filename,
      normalizedBaseName: normalized,
      side: 'BACK',
      extension: ext,
    };
  }

  // Pattern B: Explicit Front Suffix
  // Matches: "_front", "-front", ".front", "_Front", etc.
  const frontSuffixRegex = /^(.*?)[\s_-]+front$/i;
  const frontDotRegex = /^(.*?)\.front$/i;

  const frontSuffixMatch = trimmedBase.match(frontSuffixRegex) || trimmedBase.match(frontDotRegex);
  if (frontSuffixMatch) {
    const rawRoot = frontSuffixMatch[1].trim();
    const normalized = rawRoot.toLowerCase().replace(/[\s-]+/g, '_');
    return {
      originalFilename: filename,
      normalizedBaseName: normalized,
      side: 'FRONT',
      extension: ext,
    };
  }

  // Compute normalized base string for non-suffix evaluation
  const normalized = trimmedBase.toLowerCase().replace(/[\s-]+/g, '_');

  // Pattern C: Generic document or ambiguous scans without explicit front/back indicator
  if (isGenericOrAmbiguousFilename(normalized, trimmedBase)) {
    return {
      originalFilename: filename,
      normalizedBaseName: normalized,
      side: 'UNKNOWN',
      extension: ext,
    };
  }

  // Pattern D: Confident card entity naming without explicit suffix
  if (isConfidentCardName(normalized, trimmedBase)) {
    return {
      originalFilename: filename,
      normalizedBaseName: normalized,
      side: 'FRONT',
      extension: ext,
    };
  }

  // Pattern E: Conservative fallback for any unclassified or uncertain filename
  return {
    originalFilename: filename,
    normalizedBaseName: normalized,
    side: 'UNKNOWN',
    extension: ext,
  };
}

/**
 * Pairs a batch of items (e.g. ImportBatchItem or HistoricalCardArchive) deterministically.
 * 
 * Rules:
 * - Only CARD_ARTWORK is eligible for automatic pairing.
 * - UNKNOWN assets are placed in grp.unknowns and NEVER automatically paired.
 * - Confirmed pairing requires strictly 1 FRONT, 1 BACK, and 0 UNKNOWN assets.
 */
export function pairCardBatch<T extends { name: string; classification?: ArchiveClassification }>(
  items: T[]
): CandidatePair<T>[] {
  const groups = new Map<string, { fronts: T[]; backs: T[]; unknowns: T[] }>();

  // 1. Group by normalized base identity
  for (const item of items) {
    // Only CARD_ARTWORK is eligible for automatic front/back pairing
    const isArtwork = !item.classification || item.classification === 'CARD_ARTWORK';
    
    if (!isArtwork) {
      // Non-artwork assets (PSD templates, rulebooks) are treated as standalone singletons
      const baseKey = `singleton:${item.name.toLowerCase()}`;
      groups.set(baseKey, { fronts: [item], backs: [], unknowns: [] });
      continue;
    }

    const analysis = analyzeCardFilename(item.name);
    const key = analysis.normalizedBaseName;

    if (!groups.has(key)) {
      groups.set(key, { fronts: [], backs: [], unknowns: [] });
    }
    const grp = groups.get(key)!;

    if (analysis.side === 'BACK') {
      grp.backs.push(item);
    } else if (analysis.side === 'FRONT') {
      grp.fronts.push(item);
    } else {
      grp.unknowns.push(item);
    }
  }

  const results: CandidatePair<T>[] = [];

  // 2. Evaluate pairings deterministically
  for (const [key, grp] of groups.entries()) {
    const all = [...grp.fronts, ...grp.backs, ...grp.unknowns];

    // Ambiguity 1: Multiple fronts or multiple backs with the same base name
    if (grp.fronts.length > 1 || grp.backs.length > 1) {
      results.push({
        cardBaseId: key,
        front: grp.fronts[0] || null,
        back: grp.backs[0] || null,
        status: 'AMBIGUOUS',
        candidates: all,
        reason: `Ambiguous match: found ${grp.fronts.length} front(s) and ${grp.backs.length} back(s) sharing identifier '${key}'.`,
      });
      continue;
    }

    // Confirmed Pair: exactly 1 front and 1 back, and ZERO unknowns
    if (grp.fronts.length === 1 && grp.backs.length === 1 && grp.unknowns.length === 0) {
      results.push({
        cardBaseId: key,
        front: grp.fronts[0],
        back: grp.backs[0],
        status: 'CONFIRMED',
        candidates: all,
      });
      continue;
    }

    // Front only: exactly 1 front, 0 backs, and 0 unknowns
    if (grp.fronts.length === 1 && grp.backs.length === 0 && grp.unknowns.length === 0) {
      results.push({
        cardBaseId: key,
        front: grp.fronts[0],
        back: null,
        status: 'FRONT_ONLY',
        candidates: all,
      });
      continue;
    }

    // Back only: exactly 1 back, 0 fronts, and 0 unknowns
    if (grp.fronts.length === 0 && grp.backs.length === 1 && grp.unknowns.length === 0) {
      results.push({
        cardBaseId: key,
        front: null,
        back: grp.backs[0],
        status: 'BACK_ONLY',
        candidates: all,
      });
      continue;
    }

    // Unknown or mixed: any presence of unknowns or unresolved combinations
    results.push({
      cardBaseId: key,
      front: grp.fronts[0] || null,
      back: grp.backs[0] || null,
      status: 'UNKNOWN_SIDE',
      candidates: all,
      reason: `Uncertain side assignment or unknown format for '${key}'.`,
    });
  }

  return results;
}
