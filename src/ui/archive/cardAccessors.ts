/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Centralized Canonical Accessors & Key Resolvers
 * 
 * Rules:
 * 1. Single source of truth: frontAsset and backAsset are canonical.
 * 2. Legacy shadow fields (originalFileName, originalFileChecksum, etc.) are derived
 *    consistently via normalizeArchiveRecord before persisting to IndexedDB.
 * 3. Centralized resolver for binary and thumbnail storage keys.
 */

import { HistoricalCardArchive, ArchiveAssetProvenance, CardAssetSide } from './types';

/**
 * Returns the primary asset for display / legacy fallback.
 * Front asset takes precedence; falls back to back asset if front is missing.
 */
export function getPrimaryAsset(record: HistoricalCardArchive): ArchiveAssetProvenance | null {
  return record.frontAsset || record.backAsset || null;
}

/**
 * Returns the effective side classification of the primary asset.
 */
export function getCardArchiveSideStatus(record: HistoricalCardArchive): 'PAIRED' | 'FRONT_ONLY' | 'BACK_ONLY' | 'SIDE_UNKNOWN' {
  const hasFront = Boolean(record.frontAsset);
  const hasBack = Boolean(record.backAsset);

  if (hasFront && hasBack) return 'PAIRED';
  if (hasFront) {
    if (record.frontAsset?.side === 'FRONT') return 'FRONT_ONLY';
    if (record.frontAsset?.side === 'BACK') return 'BACK_ONLY';
    return 'SIDE_UNKNOWN';
  }
  if (hasBack) {
    if (record.backAsset?.side === 'BACK') return 'BACK_ONLY';
    if (record.backAsset?.side === 'FRONT') return 'FRONT_ONLY';
    return 'SIDE_UNKNOWN';
  }
  return 'SIDE_UNKNOWN';
}

/**
 * Centralized Storage Key Resolver.
 * Maps a card's asset to its exact key in archive_binaries or derived_thumbnails.
 * 
 * Rules:
 * - Front / Legacy asset: returns record.archiveId (or asset.binaryStorageKey if explicitly defined).
 * - Back asset: returns asset.binaryStorageKey || asset.assetId.
 */
export function resolveAssetBinaryKey(
  record: HistoricalCardArchive,
  side: 'FRONT' | 'BACK'
): string | null {
  const asset = side === 'FRONT' ? record.frontAsset : record.backAsset;
  if (!asset) return null;

  if (asset.binaryStorageKey) {
    return asset.binaryStorageKey;
  }

  // Fallback convention
  return side === 'FRONT' ? record.archiveId : asset.assetId;
}

/**
 * Synchronizes legacy shadow fields with canonical frontAsset / backAsset provenance.
 * Guarantees legacy components reading record.originalFileName, record.originalFileChecksum,
 * etc., always see accurate, updated values without independent drift.
 */
export function normalizeArchiveRecord(record: HistoricalCardArchive): HistoricalCardArchive {
  const primary = getPrimaryAsset(record);
  if (!primary) {
    return {
      ...record,
      schemaVersion: record.schemaVersion || 2,
    };
  }

  return {
    ...record,
    schemaVersion: 2,
    originalFileName: primary.fileName,
    originalFileType: primary.fileType,
    originalFileSize: primary.fileSize,
    originalFileChecksum: primary.fileChecksum,
    sourceProvider: primary.sourceProvider,
    sourceFolderPath: primary.sourceFolderPath,
    sourceDriveFileId: primary.sourceDriveFileId,
    importedAt: primary.importedAt,
  };
}

/**
 * Generates a collision-resistant UUID v4 for assets.
 */
export function generateAssetId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `asset-${crypto.randomUUID()}`;
  }
  return `asset-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}
