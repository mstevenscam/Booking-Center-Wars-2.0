/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Milestone 4 — Physical Card Archive, Google Drive Integration & Import Centre
 * 
 * Strict Domain Model:
 * 1. HistoricalCardArchive: Represents permanent archival preservation of original
 *    physical card scans (.jpg, .png, .webp, .tif) and Photoshop templates (.psd).
 * 2. PlayableCardDefinition: Represents mutable digital playable cards that reference
 *    an archive record, supporting multiple playable variations per historical scan.
 */

import { Department, CardRarity, CardType } from '../types';

export type ArchiveClassification = 
  | 'CARD_ARTWORK'         // Original scan of physical cards
  | 'PHOTOSHOP_TEMPLATE'   // Master .psd template file
  | 'OTHER_ASSET';         // Rulebooks, sketches, promo collateral

export type ArchiveSourceProvider = 
  | 'GOOGLE_DRIVE' 
  | 'LOCAL_UPLOAD';

export type CardAssetSide = 'FRONT' | 'BACK' | 'UNKNOWN';

export interface ArchiveAssetProvenance {
  assetId: string;                   // Collision-safe UUID: e.g. "asset-550e8400-e29b-41d4-a716-446655440000"
  side: CardAssetSide;               // 'FRONT' | 'BACK' | 'UNKNOWN'
  binaryStorageKey: string;          // Key in archive_binaries (archiveId for front, assetId for back)
  fileName: string;                  // Exact original filename (e.g. "hockeycard_PAIGE.png")
  fileType: string;                  // MIME type (e.g. "image/png")
  fileSize: number;                  // Raw byte size
  fileChecksum: string;              // Cryptographic SHA-256 hash (64 characters)
  sourceProvider: ArchiveSourceProvider;
  sourceFolderPath: string | null;   // e.g. "Humber Booking Centre Archive/2021 Scans"
  sourceDriveFileId: string | null;  // Google Drive file ID if imported via Drive
  importedAt: string;                // ISO timestamp
}

export interface ReversibleLinkSnapshot {
  originalSecondaryArchiveId: string;
  originalSecondaryRecord: HistoricalCardArchive;
  linkedPlayableCardIds: string[];   // Exact IDs of playable cards originally pointing to secondary
  linkedAt: string;
}

export interface HistoricalCardArchive {
  archiveId: string;                   // Stable unique ID, e.g. "arc-2022-sarah-cable-9f82a1"
  schemaVersion?: number;              // Version marker: 2 for two-sided model

  // Canonical asset references (The single source of truth for assets)
  frontAsset?: ArchiveAssetProvenance | null;
  backAsset?: ArchiveAssetProvenance | null;

  // Archival card-level metadata
  originalCreationYear: number | null; // e.g. 2018, 2021, 2022, 2023
  classification: ArchiveClassification;
  userNotes: string | null;
  derivedThumbnailId?: string | null;
  isDemoData?: boolean;
  metadata?: {
    photoshopLayersDetected?: boolean;
    dimensions?: { width: number; height: number };
    aiSuggestedTitle?: string;
    aiSuggestedDepartment?: Department;
    aiExtractedFlavor?: string;
    unlinkingSnapshot?: ReversibleLinkSnapshot | null;
  };

  // -------------------------------------------------------------
  // Legacy Read-Compatibility Shadow Fields (Derived via accessors)
  // -------------------------------------------------------------
  originalFileName: string;            // Exact original filename
  originalFileType: string;            // MIME type (e.g. "image/jpeg", "image/vnd.adobe.photoshop")
  originalFileSize: number;            // Size in bytes
  originalFileChecksum: string;        // Cryptographic SHA-256 hash of file content
  sourceProvider: ArchiveSourceProvider;
  sourceFolderPath: string | null;     // e.g. "Humber Booking Centre Archive/2022 Scans"
  sourceDriveFileId: string | null;    // Google Drive file ID if imported via Drive
  importedAt: string;                  // ISO timestamp
}

export interface StorageStatus {
  isPersistent: boolean;
  storageEngine: 'INDEXED_DB' | 'UNAVAILABLE';
  error: string | null;
  isDevMemoryMode?: boolean;
}

export interface BundleValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recordsCount: number;
  assetsCount: number;
  playableCount: number;
}

export interface PlayableCardDefinition {
  playableCardId: string;              // e.g. "play-sarah-cable-v1"
  archiveId: string | null;            // References HistoricalCardArchive.archiveId (null for pure digital cards)
  displayName: string;
  variationName: string;               // e.g. "Standard Roster", "Alt-Art Promo", "Tournament Foil"
  cardType: CardType;
  rarity: CardRarity;
  department: Department;
  shiftCost: number;
  efficiency: number;                  // Combat efficiency (power)
  stamina: number;                     // Base stamina
  maxStamina: number;
  influence: number;                   // Queue and terminal victory points
  keywords: string[];
  abilityName: string | null;
  abilityDesc: string | null;
  flavor: string;
  avatarGradient?: string;
  iconName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatchItem {
  id: string;
  file: Blob | File;
  name: string;
  type: string;
  size: number;
  checksum: string;
  creationYear: number | null;
  sourceFolderPath: string | null;
  sourceDriveFileId: string | null;
  sourceProvider: ArchiveSourceProvider;
  classification: ArchiveClassification;
  previewUrl: string | null;
  isDuplicate: boolean;
  duplicateReason?: string;
  matchedArchiveId?: string;
  status: 'PENDING' | 'IMPORTING' | 'SUCCESS' | 'ERROR';
  error?: string;
}

export interface ArchiveFilterOptions {
  searchQuery: string;
  year: number | 'ALL';
  classification: ArchiveClassification | 'ALL';
  sourceProvider: ArchiveSourceProvider | 'ALL';
  hasPlayableVariation: boolean | 'ALL';
  side?: 'ALL' | 'PAIRED' | 'FRONT_ONLY' | 'BACK_ONLY' | 'SIDE_UNKNOWN';
  sortBy: 'NAME' | 'YEAR_DESC' | 'YEAR_ASC' | 'IMPORT_DATE_DESC' | 'SIZE_DESC';
}

export interface ArchiveExportBundle {
  version: number;
  exportedAt: string;
  records: HistoricalCardArchive[];
  playableCards: PlayableCardDefinition[];
  assets: {
    archiveId: string;
    originalFileName: string;
    mimeType: string;
    base64Data: string;
  }[];
}

export interface DriveFolderInfo {
  id: string;
  name: string;
  year?: number | null;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime?: string;
  folderPath?: string;
}
