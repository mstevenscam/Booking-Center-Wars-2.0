/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Deterministic Card Front/Back Recognition and Pairing Engine
 * 
 * Rules:
 * 1. Matching is strictly case-insensitive.
 * 2. Back-side suffix pattern recognition:
 *    - Recognized back suffixes: '_back', '-back', '.back' (case-insensitive).
 *    - Suffix is stripped to compute the normalized shared card base identity.
 *    - Optional front suffixes: '_front', '-front', '.front' (stripped to match base).
 * 3. Exact matching: Two files pair if and only if their normalized base identities match exactly.
 * 4. Supports common extensions: .jpg, .jpeg, .png, .webp, .tif, .tiff, .psd (case-insensitive).
 *    Files do NOT require matching extensions.
 * 5. Whitespace is safely trimmed.
 * 6. Never pairs files based only on loose, fuzzy, or partial filename similarity.
 * 7. Flags ambiguous matches (e.g. multiple candidate backs or conflicting candidates) as AMBIGUOUS.
 * 8. Only CARD_ARTWORK classification is eligible for automatic pairing (PHOTOSHOP_TEMPLATE and OTHER_ASSET are excluded).
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
 * Deterministically analyzes a filename to extract side and normalized card identity.
 * 
 * Example:
 * - "hockeycard_PAIGE.png" -> normalized: "hockeycard_paige", side: "FRONT"
 * - "hockeycard_paige_back.png" -> normalized: "hockeycard_paige", side: "BACK"
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
    // Normalize root: lower-case, collapse multiple spaces/underscores
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

  // Compute normalized base string for default patterns
  const normalized = trimmedBase.toLowerCase().replace(/[\s-]+/g, '_');

  // Pattern C: Non-card assets, generic documents, or ambiguous names without clear front indicator
  // If filename starts with non-alphanumeric, symbols, or generic terms (e.g. "scan", "document", "???")
  if (!/^[a-z0-9]/i.test(trimmedBase) || /^[_\W]+/.test(trimmedBase)) {
    return {
      originalFilename: filename,
      normalizedBaseName: normalized,
      side: 'UNKNOWN',
      extension: ext,
    };
  }

  // Pattern D: Standard alphanumeric card scan
  return {
    originalFilename: filename,
    normalizedBaseName: normalized,
    side: 'FRONT',
    extension: ext,
  };
}

/**
 * Pairs a batch of items (e.g. ImportBatchItem or HistoricalCardArchive) deterministically.
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

    // Confirmed Pair: exactly 1 front and 1 back
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

    // Front only
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

    // Back only
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

    // Unknown or mixed
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
