/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Persistent IndexedDB Archive Storage Engine (Milestone 4B Hardened)
 * 
 * Strict Reliability Guarantees:
 * - Persistent storage fails safely: never silently falls back to volatile memory during user imports.
 * - Explicit StorageStatus and user-visible error reporting.
 * - Bit-for-bit unaltered preservation of original card scans and Photoshop templates.
 * - Archive ID collision safety: prevents accidental overwriting of distinct records.
 * - Deep validation of backup bundles (structure, checksums, assets, and playable card references).
 * - Restoring backups never silently overwrites existing records.
 */

import { 
  HistoricalCardArchive, 
  PlayableCardDefinition, 
  ArchiveExportBundle,
  ArchiveExportAsset,
  StorageStatus,
  BundleValidationResult,
  ArchiveAssetProvenance
} from './types';
import { blobToBase64, base64ToBlob, calculateFileChecksum } from './utils';
import { normalizeArchiveRecord, resolveAssetBinaryKey, generateAssetId } from './cardAccessors';
import { analyzeCardFilename } from './cardPairing';

const DB_NAME = 'BookingWarsArchiveDB';
const DB_VERSION = 1;

export const MIGRATION_VERSION_MARKER = '__archive_meta_migration_v2__';

const STORES = {
  RECORDS: 'archive_records',
  BINARIES: 'archive_binaries',
  THUMBNAILS: 'derived_thumbnails',
  PLAYABLE: 'playable_definitions',
} as const;

export class ArchiveStorage {
  private db: IDBDatabase | null = null;
  private isPersistent = false;
  private initError: string | null = null;
  private isDevMemoryMode = false;

  public migrationStatus: 'IDLE' | 'COMPLETED' | 'FAILED' = 'IDLE';
  public migrationError: string | null = null;

  // In-memory fallback structures (strictly for unit tests or explicit dev mode)
  private memRecords = new Map<string, HistoricalCardArchive>();
  private memBinaries = new Map<string, { archiveId: string; blob: Blob; checksum: string }>();
  private memThumbnails = new Map<string, Blob>();
  private memPlayable = new Map<string, PlayableCardDefinition>();

  /**
   * Explicitly enables temporary in-memory mode for development or unit testing.
   */
  public enableDevMemoryMode(): void {
    this.isDevMemoryMode = true;
  }

  public disableDevMemoryMode(): void {
    this.isDevMemoryMode = false;
  }

  public getStorageStatus(): StorageStatus {
    return {
      isPersistent: this.isPersistent,
      storageEngine: this.isPersistent ? 'INDEXED_DB' : 'UNAVAILABLE',
      error: this.initError,
      migrationStatus: this.migrationStatus,
      migrationError: this.migrationError,
      isDevMemoryMode: this.isDevMemoryMode,
    };
  }

  public isPersistentStorageAvailable(): boolean {
    return this.isPersistent;
  }

  /**
   * Allows retrying an interrupted or failed storage migration.
   */
  public async retryMigration(): Promise<void> {
    if (!this.db && !this.isDevMemoryMode) {
      await this.init();
      if (this.migrationStatus === 'COMPLETED') return;
    }
    try {
      await this.migratePhysicalCardAssets();
      this.migrationStatus = 'COMPLETED';
      this.migrationError = null;
      this.initError = null;
      this.isPersistent = true;
    } catch (err: any) {
      this.migrationStatus = 'FAILED';
      this.migrationError = err?.message || String(err);
      this.initError = `Storage migration failed: ${this.migrationError}. Storage operations paused to protect archive integrity.`;
      this.isPersistent = false;
      throw err;
    }
  }

  public async init(): Promise<void> {
    if (this.db) {
      if (this.migrationStatus !== 'FAILED') {
        this.isPersistent = true;
      }
      return;
    }

    // Detect if IndexedDB is available in environment
    const idb = typeof window !== 'undefined' ? window.indexedDB : (globalThis as any).indexedDB;
    if (!idb) {
      this.isPersistent = false;
      this.initError = 'IndexedDB API is not supported or is blocked in this browser environment.';
      return;
    }

    return new Promise((resolve) => {
      try {
        const req = idb.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
          const db = (e.target as IDBOpenDBRequest).result;

          // 1. Archive Records Store
          if (!db.objectStoreNames.contains(STORES.RECORDS)) {
            const recordStore = db.createObjectStore(STORES.RECORDS, { keyPath: 'archiveId' });
            recordStore.createIndex('checksum', 'originalFileChecksum', { unique: false });
            recordStore.createIndex('driveId', 'sourceDriveFileId', { unique: false });
            recordStore.createIndex('year', 'originalCreationYear', { unique: false });
            recordStore.createIndex('classification', 'classification', { unique: false });
          }

          // 2. Archive Binaries Store (Raw original file bytes)
          if (!db.objectStoreNames.contains(STORES.BINARIES)) {
            const binaryStore = db.createObjectStore(STORES.BINARIES, { keyPath: 'archiveId' });
            binaryStore.createIndex('checksum', 'checksum', { unique: false });
          }

          // 3. Derived Thumbnails Store (Separate derivative assets)
          if (!db.objectStoreNames.contains(STORES.THUMBNAILS)) {
            db.createObjectStore(STORES.THUMBNAILS, { keyPath: 'archiveId' });
          }

          // 4. Playable Card Definitions Store
          if (!db.objectStoreNames.contains(STORES.PLAYABLE)) {
            const playableStore = db.createObjectStore(STORES.PLAYABLE, { keyPath: 'playableCardId' });
            playableStore.createIndex('archiveId', 'archiveId', { unique: false });
          }
        };

        req.onsuccess = async () => {
          this.db = req.result;
          this.initError = null;
          try {
            await this.migratePhysicalCardAssets();
            this.migrationStatus = 'COMPLETED';
            this.migrationError = null;
            this.isPersistent = true;
          } catch (mErr: any) {
            this.isPersistent = false;
            this.migrationStatus = 'FAILED';
            this.migrationError = mErr?.message || String(mErr);
            this.initError = `Storage migration failed: ${this.migrationError}. Storage operations paused to protect archive integrity.`;
            console.error('Persistent storage migration failed:', mErr);
          }
          resolve();
        };

        req.onerror = () => {
          this.isPersistent = false;
          this.initError = req.error ? `${req.error.name}: ${req.error.message}` : 'IndexedDB failed to open';
          console.warn('Persistent storage failed to initialize:', this.initError);
          resolve();
        };

        req.onblocked = () => {
          this.isPersistent = false;
          this.initError = 'IndexedDB database open request was blocked by another tab or session';
          console.warn('IndexedDB blocked:', this.initError);
          resolve();
        };
      } catch (err: any) {
        this.isPersistent = false;
        this.initError = err?.message || 'IndexedDB initialization threw an exception';
        console.warn('IndexedDB open threw:', err);
        resolve();
      }
    });
  }

  /**
   * Saves an original scanned card or template and its metadata.
   * Fails safely: throws an explicit error if persistent browser storage is unavailable.
   * Collision protection: prevents overwriting a different file that shares an ID.
   */
  public async saveArchiveRecord(
    record: HistoricalCardArchive, 
    fileBlob: Blob, 
    thumbnailBlob?: Blob | null
  ): Promise<void> {
    await this.init();

    // Check persistent storage availability
    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        // Explicit development testing mode
        this.memRecords.set(record.archiveId, { ...record });
        this.memBinaries.set(record.archiveId, { 
          archiveId: record.archiveId, 
          blob: fileBlob, 
          checksum: record.originalFileChecksum 
        });
        if (thumbnailBlob) {
          this.memThumbnails.set(record.archiveId, thumbnailBlob);
        }
        return;
      }

      // Production fail-safe: never report false permanent success!
      throw new Error(
        `Persistent storage unavailable: ${this.initError || 'IndexedDB could not be opened'}. To prevent data loss of original card scans, saving is blocked.`
      );
    }

    // Verify ID Collision Safety
    const existing = await this.getArchiveRecord(record.archiveId);
    if (existing && existing.originalFileChecksum !== record.originalFileChecksum) {
      throw new Error(
        `Archive ID collision detected for '${record.archiveId}'. An existing record (${existing.originalFileName}) is already registered with different content. Collision aborted to protect data integrity.`
      );
    }

    // Ensure frontAsset and shadow fields are normalized
    let normalized = normalizeArchiveRecord(record);
    if (!normalized.frontAsset && !normalized.backAsset) {
      const sideAnalysis = analyzeCardFilename(normalized.originalFileName);
      const asset: ArchiveAssetProvenance = {
        assetId: generateAssetId(),
        side: sideAnalysis.side,
        binaryStorageKey: normalized.archiveId,
        fileName: normalized.originalFileName,
        fileType: normalized.originalFileType,
        fileSize: normalized.originalFileSize,
        fileChecksum: normalized.originalFileChecksum,
        sourceProvider: normalized.sourceProvider,
        sourceFolderPath: normalized.sourceFolderPath,
        sourceDriveFileId: normalized.sourceDriveFileId,
        importedAt: normalized.importedAt,
      };

      if (sideAnalysis.side === 'BACK') {
        normalized.frontAsset = null;
        normalized.backAsset = asset;
      } else {
        normalized.frontAsset = asset;
        normalized.backAsset = null;
      }
      normalized = normalizeArchiveRecord(normalized);
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(
          [STORES.RECORDS, STORES.BINARIES, STORES.THUMBNAILS], 
          'readwrite'
        );

        tx.onerror = () => {
          const err = tx.error;
          const msg = err ? `${err.name}: ${err.message}` : 'Transaction failed';
          reject(new Error(`Failed to save card scan to persistent storage: ${msg}`));
        };

        tx.onabort = () => {
          reject(new Error('Persistent storage transaction was aborted by the browser.'));
        };

        tx.oncomplete = () => resolve();

        tx.objectStore(STORES.RECORDS).put(normalized);
        tx.objectStore(STORES.BINARIES).put({
          archiveId: normalized.archiveId,
          blob: fileBlob,
          originalFileName: normalized.originalFileName,
          originalFileType: normalized.originalFileType,
          checksum: normalized.originalFileChecksum,
        });

        if (thumbnailBlob) {
          tx.objectStore(STORES.THUMBNAILS).put({
            archiveId: normalized.archiveId,
            blob: thumbnailBlob,
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Saves a two-sided physical card with both FRONT and BACK original scans.
   * - Front asset binary is keyed under record.archiveId.
   * - Back asset binary is keyed under record.backAsset.binaryStorageKey (UUID assetId).
   * - Both original binaries and derived thumbnails are stored atomically.
   */
  public async savePairedArchiveRecord(
    record: HistoricalCardArchive,
    frontFileBlob: Blob,
    backFileBlob: Blob,
    frontThumbnailBlob?: Blob | null,
    backThumbnailBlob?: Blob | null
  ): Promise<void> {
    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        let normalized = normalizeArchiveRecord(record);
        this.memRecords.set(normalized.archiveId, { ...normalized });
        this.memBinaries.set(normalized.archiveId, {
          archiveId: normalized.archiveId,
          blob: frontFileBlob,
          checksum: normalized.frontAsset?.fileChecksum || normalized.originalFileChecksum,
        });
        if (frontThumbnailBlob) {
          this.memThumbnails.set(normalized.archiveId, frontThumbnailBlob);
        }
        if (normalized.backAsset) {
          const backKey = normalized.backAsset.binaryStorageKey || normalized.backAsset.assetId;
          this.memBinaries.set(backKey, {
            archiveId: backKey,
            blob: backFileBlob,
            checksum: normalized.backAsset.fileChecksum,
          });
          if (backThumbnailBlob) {
            this.memThumbnails.set(backKey, backThumbnailBlob);
          }
        }
        return;
      }

      throw new Error(
        `Persistent storage unavailable: ${this.initError || 'IndexedDB could not be opened'}. To prevent data loss of original card scans, saving is blocked.`
      );
    }

    // Verify ID Collision Safety
    const existing = await this.getArchiveRecord(record.archiveId);
    if (existing && existing.originalFileChecksum !== record.originalFileChecksum) {
      throw new Error(
        `Archive ID collision detected for '${record.archiveId}'. An existing record (${existing.originalFileName}) is already registered with different content. Collision aborted to protect data integrity.`
      );
    }

    let normalized = normalizeArchiveRecord(record);
    const backKey = normalized.backAsset?.binaryStorageKey || normalized.backAsset?.assetId;

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(
          [STORES.RECORDS, STORES.BINARIES, STORES.THUMBNAILS],
          'readwrite'
        );

        tx.onerror = () => {
          const err = tx.error;
          const msg = err ? `${err.name}: ${err.message}` : 'Transaction failed';
          reject(new Error(`Failed to save paired card scans to persistent storage: ${msg}`));
        };

        tx.onabort = () => {
          reject(new Error('Persistent storage transaction was aborted by the browser.'));
        };

        tx.oncomplete = () => resolve();

        // 1. Save normalized record
        tx.objectStore(STORES.RECORDS).put(normalized);

        // 2. Save front binary
        tx.objectStore(STORES.BINARIES).put({
          archiveId: normalized.archiveId,
          blob: frontFileBlob,
          originalFileName: normalized.frontAsset?.fileName || normalized.originalFileName,
          originalFileType: normalized.frontAsset?.fileType || normalized.originalFileType,
          checksum: normalized.frontAsset?.fileChecksum || normalized.originalFileChecksum,
        });

        // 3. Save front thumbnail if present
        if (frontThumbnailBlob) {
          tx.objectStore(STORES.THUMBNAILS).put({
            archiveId: normalized.archiveId,
            blob: frontThumbnailBlob,
          });
        }

        // 4. Save back binary under backKey
        if (backKey && normalized.backAsset) {
          tx.objectStore(STORES.BINARIES).put({
            archiveId: backKey,
            blob: backFileBlob,
            originalFileName: normalized.backAsset.fileName,
            originalFileType: normalized.backAsset.fileType,
            checksum: normalized.backAsset.fileChecksum,
          });

          // 5. Save back thumbnail under backKey
          if (backThumbnailBlob) {
            tx.objectStore(STORES.THUMBNAILS).put({
              archiveId: backKey,
              blob: backThumbnailBlob,
            });
          }
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  public async getArchiveRecord(archiveId: string): Promise<HistoricalCardArchive | null> {
    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        return this.memRecords.get(archiveId) || null;
      }
      return null;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.RECORDS, 'readonly');
      const req = tx.objectStore(STORES.RECORDS).get(archiveId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllArchiveRecords(): Promise<HistoricalCardArchive[]> {
    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        return Array.from(this.memRecords.values()).filter(r => !r.archiveId.startsWith('__'));
      }
      return [];
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.RECORDS, 'readonly');
      const req = tx.objectStore(STORES.RECORDS).getAll();
      req.onsuccess = () => {
        const records: HistoricalCardArchive[] = req.result || [];
        resolve(records.filter(r => !r.archiveId.startsWith('__')));
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async updateArchiveRecord(record: HistoricalCardArchive): Promise<void> {
    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        if (!this.memRecords.has(record.archiveId)) {
          throw new Error(`Record ${record.archiveId} not found`);
        }
        this.memRecords.set(record.archiveId, { ...record });
        return;
      }
      throw new Error(`Persistent storage unavailable: ${this.initError}`);
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.RECORDS, 'readwrite');
      const req = tx.objectStore(STORES.RECORDS).put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteArchiveRecord(archiveId: string): Promise<void> {
    await this.init();

    const record = await this.getArchiveRecord(archiveId);
    const backKey = record?.backAsset && record.backAsset.binaryStorageKey !== archiveId 
      ? record.backAsset.binaryStorageKey 
      : null;

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        this.memRecords.delete(archiveId);
        this.memBinaries.delete(archiveId);
        this.memThumbnails.delete(archiveId);
        if (backKey) {
          this.memBinaries.delete(backKey);
          this.memThumbnails.delete(backKey);
        }
        return;
      }
      throw new Error(`Persistent storage unavailable: ${this.initError}`);
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        [STORES.RECORDS, STORES.BINARIES, STORES.THUMBNAILS], 
        'readwrite'
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      tx.objectStore(STORES.RECORDS).delete(archiveId);
      tx.objectStore(STORES.BINARIES).delete(archiveId);
      tx.objectStore(STORES.THUMBNAILS).delete(archiveId);

      if (backKey) {
        tx.objectStore(STORES.BINARIES).delete(backKey);
        tx.objectStore(STORES.THUMBNAILS).delete(backKey);
      }
    });
  }

  public async getArchiveBinary(archiveId: string): Promise<Blob | null> {
    const front = await this.getArchiveBinaryForSide(archiveId, 'FRONT');
    if (front) return front;
    return this.getArchiveBinaryForSide(archiveId, 'BACK');
  }

  public async getArchiveThumbnail(archiveId: string): Promise<Blob | null> {
    const front = await this.getArchiveThumbnailForSide(archiveId, 'FRONT');
    if (front) return front;
    return this.getArchiveThumbnailForSide(archiveId, 'BACK');
  }

  /**
   * Retrieves original binary for a specific side ('FRONT' | 'BACK').
   * Resolves the storage key dynamically (archiveId for front, assetId for back).
   */
  public async getArchiveBinaryForSide(archiveId: string, side: 'FRONT' | 'BACK'): Promise<Blob | null> {
    await this.init();

    // Look up record to determine storage key
    const record = await this.getArchiveRecord(archiveId);
    let storageKey = archiveId;

    if (record) {
      if (record.frontAsset || record.backAsset) {
        const resolved = resolveAssetBinaryKey(record, side);
        if (!resolved) {
          return null; // Side does not exist on this record
        }
        storageKey = resolved;
      }
    }

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        const item = this.memBinaries.get(storageKey);
        return item ? item.blob : null;
      }
      return null;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.BINARIES, 'readonly');
      const req = tx.objectStore(STORES.BINARIES).get(storageKey);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Retrieves derived thumbnail for a specific side ('FRONT' | 'BACK').
   */
  public async getArchiveThumbnailForSide(archiveId: string, side: 'FRONT' | 'BACK'): Promise<Blob | null> {
    await this.init();

    const record = await this.getArchiveRecord(archiveId);
    let storageKey = archiveId;

    if (record) {
      if (record.frontAsset || record.backAsset) {
        const resolved = resolveAssetBinaryKey(record, side);
        if (!resolved) {
          return null; // Side does not exist on this record
        }
        storageKey = resolved;
      }
    }

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        return this.memThumbnails.get(storageKey) || null;
      }
      return null;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.THUMBNAILS, 'readonly');
      const req = tx.objectStore(STORES.THUMBNAILS).get(storageKey);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Dual duplicate detection by SHA-256 hash or Google Drive File ID.
   */
  public async checkDuplicate(
    checksum: string, 
    driveFileId?: string | null
  ): Promise<{ isDuplicate: boolean; matchedRecord?: HistoricalCardArchive; reason?: string }> {
    const all = await this.getAllArchiveRecords();

    // 1. Check content SHA-256
    const hashMatch = all.find(r => r.originalFileChecksum === checksum);
    if (hashMatch) {
      return {
        isDuplicate: true,
        matchedRecord: hashMatch,
        reason: `Matches existing file content (${hashMatch.originalFileName}) via SHA-256 hash`,
      };
    }

    // 2. Check Drive File ID
    if (driveFileId) {
      const driveMatch = all.find(r => r.sourceDriveFileId === driveFileId);
      if (driveMatch) {
        return {
          isDuplicate: true,
          matchedRecord: driveMatch,
          reason: `Matches Google Drive file ID (${driveMatch.originalFileName})`,
        };
      }
    }

    return { isDuplicate: false };
  }

  // ==========================================
  // PLAYABLE CARD DEFINITION MANAGEMENT
  // ==========================================

  public async savePlayableCard(card: PlayableCardDefinition): Promise<void> {
    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        this.memPlayable.set(card.playableCardId, { ...card });
        return;
      }
      throw new Error(`Persistent storage unavailable: ${this.initError}`);
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.PLAYABLE, 'readwrite');
      const req = tx.objectStore(STORES.PLAYABLE).put(card);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getPlayableCard(playableCardId: string): Promise<PlayableCardDefinition | null> {
    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        return this.memPlayable.get(playableCardId) || null;
      }
      return null;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.PLAYABLE, 'readonly');
      const req = tx.objectStore(STORES.PLAYABLE).get(playableCardId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllPlayableCards(): Promise<PlayableCardDefinition[]> {
    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        return Array.from(this.memPlayable.values());
      }
      return [];
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.PLAYABLE, 'readonly');
      const req = tx.objectStore(STORES.PLAYABLE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async getPlayableCardsForArchive(archiveId: string): Promise<PlayableCardDefinition[]> {
    const all = await this.getAllPlayableCards();
    return all.filter(c => c.archiveId === archiveId);
  }

  // ==========================================
  // MILESTONE 5: MIGRATION & ATOMIC LINKING
  // ==========================================

  /**
   * Idempotent background migration from legacy single-sided archive records to two-sided model.
   * - Uses deterministic side analysis (cardPairing.ts) to correctly populate frontAsset, backAsset, or UNKNOWN.
   * - Never automatically merges records.
   * - Never deletes or mutates original binaries or checksums.
   * - Records a version marker (__archive_meta_migration_v2__) upon completion.
   */
  public async migratePhysicalCardAssets(): Promise<void> {
    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        // Dev memory migration
        for (const [id, rec] of this.memRecords.entries()) {
          if (id.startsWith('__')) continue;
          if (!rec.frontAsset && !rec.backAsset) {
            const sideAnalysis = analyzeCardFilename(rec.originalFileName);
            const asset: ArchiveAssetProvenance = {
              assetId: generateAssetId(),
              side: sideAnalysis.side,
              binaryStorageKey: rec.archiveId,
              fileName: rec.originalFileName,
              fileType: rec.originalFileType,
              fileSize: rec.originalFileSize,
              fileChecksum: rec.originalFileChecksum,
              sourceProvider: rec.sourceProvider,
              sourceFolderPath: rec.sourceFolderPath,
              sourceDriveFileId: rec.sourceDriveFileId,
              importedAt: rec.importedAt,
            };

            const updated: HistoricalCardArchive = {
              ...rec,
              schemaVersion: 2,
              frontAsset: sideAnalysis.side === 'BACK' ? null : asset,
              backAsset: sideAnalysis.side === 'BACK' ? asset : null,
            };
            this.memRecords.set(id, normalizeArchiveRecord(updated));
          }
        }
        this.memRecords.set(MIGRATION_VERSION_MARKER, {
          archiveId: MIGRATION_VERSION_MARKER,
          schemaVersion: 2,
          originalFileName: 'MIGRATION_MARKER',
          originalFileType: 'application/json',
          originalFileSize: 0,
          originalFileChecksum: 'none',
          sourceProvider: 'LOCAL_UPLOAD',
          sourceFolderPath: null,
          sourceDriveFileId: null,
          importedAt: new Date().toISOString(),
          classification: 'OTHER_ASSET',
          userNotes: `Migrated at ${new Date().toISOString()}`,
          originalCreationYear: null,
        });
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction([STORES.RECORDS], 'readwrite');
        const store = tx.objectStore(STORES.RECORDS);

        // Check if migration marker is already set
        const markerReq = store.get(MIGRATION_VERSION_MARKER);

        markerReq.onsuccess = () => {
          if (markerReq.result) {
            resolve(); // Already migrated
            return;
          }

          const allReq = store.getAll();
          allReq.onsuccess = () => {
            try {
              const records: HistoricalCardArchive[] = allReq.result || [];
              for (const rec of records) {
                if (rec.archiveId.startsWith('__')) continue;
                if (!rec.frontAsset && !rec.backAsset) {
                  const sideAnalysis = analyzeCardFilename(rec.originalFileName);
                  const asset: ArchiveAssetProvenance = {
                    assetId: generateAssetId(),
                    side: sideAnalysis.side,
                    binaryStorageKey: rec.archiveId,
                    fileName: rec.originalFileName,
                    fileType: rec.originalFileType,
                    fileSize: rec.originalFileSize,
                    fileChecksum: rec.originalFileChecksum,
                    sourceProvider: rec.sourceProvider,
                    sourceFolderPath: rec.sourceFolderPath,
                    sourceDriveFileId: rec.sourceDriveFileId,
                    importedAt: rec.importedAt,
                  };

                  const updated: HistoricalCardArchive = {
                    ...rec,
                    schemaVersion: 2,
                    frontAsset: sideAnalysis.side === 'BACK' ? null : asset,
                    backAsset: sideAnalysis.side === 'BACK' ? asset : null,
                  };

                  store.put(normalizeArchiveRecord(updated));
                }
              }

              // Set isolated migration marker ONLY after all records are written
              store.put({
                archiveId: MIGRATION_VERSION_MARKER,
                schemaVersion: 2,
                originalFileName: 'MIGRATION_MARKER',
                originalFileType: 'application/json',
                originalFileSize: 0,
                originalFileChecksum: 'none',
                sourceProvider: 'LOCAL_UPLOAD',
                sourceFolderPath: null,
                sourceDriveFileId: null,
                importedAt: new Date().toISOString(),
                classification: 'OTHER_ASSET',
                userNotes: `Migrated at ${new Date().toISOString()}`,
                originalCreationYear: null,
              });
            } catch (pErr) {
              tx.abort();
              reject(pErr);
            }
          };

          allReq.onerror = () => {
            tx.abort();
            reject(allReq.error);
          };
        };

        markerReq.onerror = () => {
          tx.abort();
          reject(markerReq.error);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error('Migration transaction aborted.'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Atomically links two existing independent archive records as FRONT and BACK of one physical card.
   * 
   * Strict Safety Guarantees:
   * - Revalidates records, binaries, and playable references directly within the active read-write transaction.
   * - Secondary record's original binary is re-keyed to a collision-safe UUID assetId.
   * - Preserves full provenance, timestamps, notes, and checksums in an unlinking snapshot.
   * - Re-points all playable card definitions from secondaryId to primaryId.
   * - Aborts atomically if any validation check fails.
   */
  public async linkExistingArchiveRecords(
    primaryId: string,
    secondaryId: string,
    primarySide: 'FRONT' | 'BACK' = 'FRONT',
    secondarySide: 'FRONT' | 'BACK' = 'BACK'
  ): Promise<HistoricalCardArchive> {
    if (primaryId === secondaryId) {
      throw new Error('Cannot link record to itself');
    }
    if (primarySide === secondarySide) {
      throw new Error(`Cannot link: primary and secondary cannot have the same side (${primarySide})`);
    }

    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        // Dev memory implementation
        const prim = this.memRecords.get(primaryId);
        const sec = this.memRecords.get(secondaryId);
        if (!prim || !sec) throw new Error('Cannot link: one or both records do not exist');

        if (prim.classification !== 'CARD_ARTWORK' || sec.classification !== 'CARD_ARTWORK') {
          throw new Error(
            `Cannot link: only CARD_ARTWORK records can be paired into physical cards (found ${prim.classification} and ${sec.classification})`
          );
        }

        if (prim.backAsset) throw new Error(`Primary card '${prim.originalFileName}' already has a back asset attached.`);
        if (sec.frontAsset && sec.backAsset) throw new Error(`Secondary card '${sec.originalFileName}' already contains two sides.`);

        if (
          prim.frontAsset?.side === 'UNKNOWN' ||
          sec.frontAsset?.side === 'UNKNOWN' ||
          sec.backAsset?.side === 'UNKNOWN'
        ) {
          throw new Error('Cannot link record with UNKNOWN side. Please classify the card side before linking.');
        }

        if (prim.frontAsset && (prim.frontAsset.side as any) !== primarySide) {
          throw new Error(`Primary record side conflict: record is designated as ${prim.frontAsset.side} but requested as ${primarySide}`);
        }
        const secSide = sec.backAsset?.side || sec.frontAsset?.side;
        if (secSide && (secSide as any) !== secondarySide) {
          throw new Error(`Secondary record side conflict: record is designated as ${secSide} but requested as ${secondarySide}`);
        }

        const secBinKey = sec.backAsset?.binaryStorageKey || sec.frontAsset?.binaryStorageKey || sec.archiveId;
        const secBin = this.memBinaries.get(secBinKey);
        if (!secBin) throw new Error(`Cannot link: secondary binary not found for '${secondaryId}'`);

        const secThumb = this.memThumbnails.get(secBinKey) || this.memThumbnails.get(sec.archiveId);
        const secPlayable = Array.from(this.memPlayable.values()).filter(p => p.archiveId === secondaryId);

        const newBackAssetId = generateAssetId();
        const backAsset: ArchiveAssetProvenance = {
          assetId: newBackAssetId,
          side: secondarySide,
          binaryStorageKey: newBackAssetId,
          fileName: sec.backAsset?.fileName || sec.frontAsset?.fileName || sec.originalFileName,
          fileType: sec.backAsset?.fileType || sec.frontAsset?.fileType || sec.originalFileType,
          fileSize: sec.backAsset?.fileSize ?? sec.frontAsset?.fileSize ?? sec.originalFileSize,
          fileChecksum: sec.backAsset?.fileChecksum || sec.frontAsset?.fileChecksum || sec.originalFileChecksum,
          sourceProvider: sec.sourceProvider,
          sourceFolderPath: sec.sourceFolderPath,
          sourceDriveFileId: sec.sourceDriveFileId,
          importedAt: sec.importedAt,
        };

        const updatedPrimary: HistoricalCardArchive = {
          ...prim,
          backAsset,
          metadata: {
            ...prim.metadata,
            unlinkingSnapshot: {
              originalSecondaryArchiveId: secondaryId,
              originalSecondaryRecord: JSON.parse(JSON.stringify(sec)),
              linkedPlayableCardIds: secPlayable.map(p => p.playableCardId),
              linkedAt: new Date().toISOString(),
            },
          },
        };

        this.memBinaries.set(newBackAssetId, {
          archiveId: newBackAssetId,
          blob: secBin.blob,
          checksum: backAsset.fileChecksum,
        });
        if (secThumb) {
          this.memThumbnails.set(newBackAssetId, secThumb);
        }

        for (const p of secPlayable) {
          this.memPlayable.set(p.playableCardId, { ...p, archiveId: primaryId });
        }

        this.memRecords.delete(secondaryId);
        this.memBinaries.delete(secondaryId);
        if (secBinKey !== secondaryId) {
          this.memBinaries.delete(secBinKey);
        }
        this.memThumbnails.delete(secondaryId);
        if (secBinKey !== secondaryId) {
          this.memThumbnails.delete(secBinKey);
        }

        const normalized = normalizeArchiveRecord(updatedPrimary);
        this.memRecords.set(primaryId, normalized);
        return normalized;
      }
      throw new Error(`Persistent storage unavailable: ${this.initError}`);
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(
          [STORES.RECORDS, STORES.BINARIES, STORES.THUMBNAILS, STORES.PLAYABLE],
          'readwrite'
        );

        const recordStore = tx.objectStore(STORES.RECORDS);
        const binaryStore = tx.objectStore(STORES.BINARIES);
        const thumbStore = tx.objectStore(STORES.THUMBNAILS);
        const playableStore = tx.objectStore(STORES.PLAYABLE);

        const primReq = recordStore.get(primaryId);
        const secReq = recordStore.get(secondaryId);

        primReq.onsuccess = () => {
          const prim: HistoricalCardArchive | undefined = primReq.result;
          if (!prim) {
            tx.abort();
            reject(new Error(`Primary record '${primaryId}' not found`));
            return;
          }

          if (prim.classification !== 'CARD_ARTWORK') {
            tx.abort();
            reject(new Error(`Cannot link: primary record is not CARD_ARTWORK (found ${prim.classification})`));
            return;
          }

          if (prim.backAsset) {
            tx.abort();
            reject(new Error(`Primary card '${prim.originalFileName}' already has a back asset attached.`));
            return;
          }

          if (prim.frontAsset?.side === 'UNKNOWN') {
            tx.abort();
            reject(new Error('Cannot link record with UNKNOWN side. Please classify the card side before linking.'));
            return;
          }

          if (prim.frontAsset && (prim.frontAsset.side as any) !== primarySide) {
            tx.abort();
            reject(new Error(`Primary record side conflict: record is designated as ${prim.frontAsset.side} but requested as ${primarySide}`));
            return;
          }

          secReq.onsuccess = () => {
            const sec: HistoricalCardArchive | undefined = secReq.result;
            if (!sec) {
              tx.abort();
              reject(new Error(`Secondary record '${secondaryId}' not found`));
              return;
            }

            if (sec.classification !== 'CARD_ARTWORK') {
              tx.abort();
              reject(new Error(`Cannot link: secondary record is not CARD_ARTWORK (found ${sec.classification})`));
              return;
            }

            if (sec.frontAsset && sec.backAsset) {
              tx.abort();
              reject(new Error(`Secondary card '${sec.originalFileName}' already contains two sides.`));
              return;
            }

            if (sec.frontAsset?.side === 'UNKNOWN' || sec.backAsset?.side === 'UNKNOWN') {
              tx.abort();
              reject(new Error('Cannot link record with UNKNOWN side. Please classify the card side before linking.'));
              return;
            }

            const secSide = sec.backAsset?.side || sec.frontAsset?.side;
            if (secSide && (secSide as any) !== secondarySide) {
              tx.abort();
              reject(new Error(`Secondary record side conflict: record is designated as ${secSide} but requested as ${secondarySide}`));
              return;
            }

            // In-transaction check for secondary binary
            const secBinKey = sec.backAsset?.binaryStorageKey || sec.frontAsset?.binaryStorageKey || sec.archiveId;
            const binReq = binaryStore.get(secBinKey);

            binReq.onsuccess = () => {
              const binEntry = binReq.result;
              if (!binEntry || !binEntry.blob) {
                tx.abort();
                reject(new Error(`Secondary binary not found for '${secondaryId}'`));
                return;
              }

              // In-transaction query for affected playable cards
              const playableIndex = playableStore.index('archiveId');
              const playReq = playableIndex.getAll(secondaryId);

              playReq.onsuccess = () => {
                const affectedPlayable: PlayableCardDefinition[] = playReq.result || [];
                const thumbReq = thumbStore.get(secBinKey);

                thumbReq.onsuccess = () => {
                  const thumbEntry = thumbReq.result;
                  const newBackAssetId = generateAssetId();

                  const backAsset: ArchiveAssetProvenance = {
                    assetId: newBackAssetId,
                    side: secondarySide,
                    binaryStorageKey: newBackAssetId,
                    fileName: sec.backAsset?.fileName || sec.frontAsset?.fileName || sec.originalFileName,
                    fileType: sec.backAsset?.fileType || sec.frontAsset?.fileType || sec.originalFileType,
                    fileSize: sec.backAsset?.fileSize ?? sec.frontAsset?.fileSize ?? sec.originalFileSize,
                    fileChecksum: sec.backAsset?.fileChecksum || sec.frontAsset?.fileChecksum || sec.originalFileChecksum,
                    sourceProvider: sec.sourceProvider,
                    sourceFolderPath: sec.sourceFolderPath,
                    sourceDriveFileId: sec.sourceDriveFileId,
                    importedAt: sec.importedAt,
                  };

                  const updatedPrimary: HistoricalCardArchive = {
                    ...prim,
                    backAsset,
                    metadata: {
                      ...prim.metadata,
                      unlinkingSnapshot: {
                        originalSecondaryArchiveId: secondaryId,
                        originalSecondaryRecord: JSON.parse(JSON.stringify(sec)),
                        linkedPlayableCardIds: affectedPlayable.map(p => p.playableCardId),
                        linkedAt: new Date().toISOString(),
                      },
                    },
                  };

                  // 1. Store secondary binary under unique back asset UUID
                  binaryStore.put({
                    archiveId: newBackAssetId,
                    blob: binEntry.blob,
                    checksum: backAsset.fileChecksum,
                    originalFileName: backAsset.fileName,
                    originalFileType: backAsset.fileType,
                  });

                  // 2. Store secondary thumbnail under back asset UUID
                  if (thumbEntry && thumbEntry.blob) {
                    thumbStore.put({
                      archiveId: newBackAssetId,
                      blob: thumbEntry.blob,
                    });
                  }

                  // 3. Re-point affected playable cards to primaryId
                  for (const p of affectedPlayable) {
                    playableStore.put({
                      ...p,
                      archiveId: primaryId,
                    });
                  }

                  // 4. Save updated primary record
                  const normalized = normalizeArchiveRecord(updatedPrimary);
                  recordStore.put(normalized);

                  // 5. Delete secondary standalone entries
                  recordStore.delete(secondaryId);
                  binaryStore.delete(secBinKey);
                  if (secBinKey !== secondaryId) {
                    binaryStore.delete(secondaryId);
                  }
                  thumbStore.delete(secBinKey);
                  if (secBinKey !== secondaryId) {
                    thumbStore.delete(secondaryId);
                  }

                  tx.oncomplete = () => resolve(normalized);
                };
                thumbReq.onerror = () => {
                  tx.abort();
                  reject(thumbReq.error);
                };
              };
              playReq.onerror = () => {
                tx.abort();
                reject(playReq.error);
              };
            };
            binReq.onerror = () => {
              tx.abort();
              reject(binReq.error);
            };
          };
          secReq.onerror = () => {
            tx.abort();
            reject(secReq.error);
          };
        };

        primReq.onerror = () => {
          tx.abort();
          reject(primReq.error);
        };

        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Atomically unlinks a two-sided card, restoring both original records and binaries intact.
   * Repoints ONLY the playable cards originally belonging to the secondary record.
   */
  public async unlinkArchiveRecord(archiveId: string): Promise<{ primary: HistoricalCardArchive; secondary: HistoricalCardArchive }> {
    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        const prim = this.memRecords.get(archiveId);
        if (!prim || !prim.backAsset) throw new Error('Record has no back asset to unlink');

        const snapshot = prim.metadata?.unlinkingSnapshot;
        if (!snapshot) throw new Error('Record does not contain an unlinking restoration snapshot');

        const secId = snapshot.originalSecondaryArchiveId;
        const restoredSec: HistoricalCardArchive = snapshot.originalSecondaryRecord;
        const backAssetId = prim.backAsset.assetId;

        const backBin = this.memBinaries.get(backAssetId);
        const backThumb = this.memThumbnails.get(backAssetId);

        if (backBin) {
          this.memBinaries.set(secId, {
            archiveId: secId,
            blob: backBin.blob,
            checksum: restoredSec.originalFileChecksum,
          });
          this.memBinaries.delete(backAssetId);
        }

        if (backThumb) {
          this.memThumbnails.set(secId, backThumb);
          this.memThumbnails.delete(backAssetId);
        }

        // Repoint only secondary playable cards
        for (const pId of snapshot.linkedPlayableCardIds) {
          const p = this.memPlayable.get(pId);
          if (p) {
            this.memPlayable.set(pId, { ...p, archiveId: secId });
          }
        }

        const updatedPrim: HistoricalCardArchive = {
          ...prim,
          backAsset: null,
          metadata: {
            ...prim.metadata,
            unlinkingSnapshot: null,
          },
        };

        const normalizedPrim = normalizeArchiveRecord(updatedPrim);
        this.memRecords.set(archiveId, normalizedPrim);
        this.memRecords.set(secId, normalizeArchiveRecord(restoredSec));

        return { primary: normalizedPrim, secondary: restoredSec };
      }
      throw new Error(`Persistent storage unavailable: ${this.initError}`);
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(
          [STORES.RECORDS, STORES.BINARIES, STORES.THUMBNAILS, STORES.PLAYABLE],
          'readwrite'
        );

        const recordStore = tx.objectStore(STORES.RECORDS);
        const binaryStore = tx.objectStore(STORES.BINARIES);
        const thumbStore = tx.objectStore(STORES.THUMBNAILS);
        const playableStore = tx.objectStore(STORES.PLAYABLE);

        const primReq = recordStore.get(archiveId);
        primReq.onsuccess = () => {
          const prim: HistoricalCardArchive | undefined = primReq.result;
          if (!prim || !prim.backAsset) {
            tx.abort();
            reject(new Error(`Card '${archiveId}' has no back asset to unlink.`));
            return;
          }

          const snapshot = prim.metadata?.unlinkingSnapshot;
          if (!snapshot) {
            tx.abort();
            reject(new Error(`Card '${prim.originalFileName}' does not contain an unlinking restoration snapshot.`));
            return;
          }

          const secId = snapshot.originalSecondaryArchiveId;
          const restoredSec: HistoricalCardArchive = snapshot.originalSecondaryRecord;
          const backAssetKey = prim.backAsset.binaryStorageKey || prim.backAsset.assetId;

          const binReq = binaryStore.get(backAssetKey);
          binReq.onsuccess = () => {
            const backBin = binReq.result;
            const thumbReq = thumbStore.get(backAssetKey);

            thumbReq.onsuccess = () => {
              const backThumb = thumbReq.result;

              // 1. Restore secondary binary under original secId
              if (backBin && backBin.blob) {
                binaryStore.put({
                  archiveId: secId,
                  blob: backBin.blob,
                  checksum: restoredSec.originalFileChecksum,
                  originalFileName: restoredSec.originalFileName,
                  originalFileType: restoredSec.originalFileType,
                });
                binaryStore.delete(backAssetKey);
              }

              // 2. Restore secondary thumbnail
              if (backThumb && backThumb.blob) {
                thumbStore.put({
                  archiveId: secId,
                  blob: backThumb.blob,
                });
                thumbStore.delete(backAssetKey);
              }

              // 3. Restore secondary record
              const normalizedSec = normalizeArchiveRecord(restoredSec);
              recordStore.put(normalizedSec);

              // 4. Update primary record to remove backAsset & snapshot
              const updatedPrim: HistoricalCardArchive = {
                ...prim,
                backAsset: null,
                metadata: {
                  ...prim.metadata,
                  unlinkingSnapshot: null,
                },
              };
              const normalizedPrim = normalizeArchiveRecord(updatedPrim);
              recordStore.put(normalizedPrim);

              // 5. Restore only playable cards that originally belonged to secondary
              const linkedIds = new Set(snapshot.linkedPlayableCardIds);
              for (const pId of linkedIds) {
                const getPReq = playableStore.get(pId);
                getPReq.onsuccess = () => {
                  const cardDef = getPReq.result;
                  if (cardDef) {
                    playableStore.put({
                      ...cardDef,
                      archiveId: secId,
                    });
                  }
                };
              }

              tx.oncomplete = () => resolve({ primary: normalizedPrim, secondary: normalizedSec });
            };
            thumbReq.onerror = () => {
              tx.abort();
              reject(thumbReq.error);
            };
          };
          binReq.onerror = () => {
            tx.abort();
            reject(binReq.error);
          };
        };

        primReq.onerror = () => {
          tx.abort();
          reject(primReq.error);
        };

        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Deleting a playable card variation NEVER deletes its underlying historical archive record!
   */
  public async deletePlayableCard(playableCardId: string): Promise<void> {
    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        this.memPlayable.delete(playableCardId);
        return;
      }
      throw new Error(`Persistent storage unavailable: ${this.initError}`);
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.PLAYABLE, 'readwrite');
      const req = tx.objectStore(STORES.PLAYABLE).delete(playableCardId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ==========================================
  // BACKUP EXPORT, VALIDATION & RESTORATION
  // ==========================================

  public async exportArchiveBundle(): Promise<ArchiveExportBundle> {
    const records = await this.getAllArchiveRecords();
    const playableCards = await this.getAllPlayableCards();

    const assets: ArchiveExportAsset[] = [];

    for (const record of records) {
      // 1. Front asset binary
      const frontBinaryBlob = await this.getArchiveBinaryForSide(record.archiveId, 'FRONT');
      if (frontBinaryBlob) {
        const base64Data = await blobToBase64(frontBinaryBlob);
        const frontKey = record.frontAsset?.binaryStorageKey || record.archiveId;
        assets.push({
          archiveId: frontKey,
          assetId: record.frontAsset?.assetId,
          side: record.frontAsset?.side || 'FRONT',
          originalFileName: record.frontAsset?.fileName || record.originalFileName,
          mimeType: record.frontAsset?.fileType || record.originalFileType,
          fileSize: record.frontAsset?.fileSize ?? frontBinaryBlob.size,
          checksum: record.frontAsset?.fileChecksum || record.originalFileChecksum,
          base64Data,
        });
      }

      // 2. Back asset binary for paired cards
      if (record.backAsset) {
        const backKey = record.backAsset.binaryStorageKey || record.backAsset.assetId;
        const backBinaryBlob = await this.getArchiveBinaryForSide(record.archiveId, 'BACK');
        if (backBinaryBlob) {
          const base64Data = await blobToBase64(backBinaryBlob);
          assets.push({
            archiveId: backKey,
            assetId: record.backAsset.assetId,
            side: record.backAsset.side || 'BACK',
            originalFileName: record.backAsset.fileName,
            mimeType: record.backAsset.fileType,
            fileSize: record.backAsset.fileSize ?? backBinaryBlob.size,
            checksum: record.backAsset.fileChecksum,
            base64Data,
          });
        }
      }
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
      playableCards,
      assets,
    };
  }

  /**
   * Validates archive backup bundle structure, SHA-256 checksums, and reference integrity.
   * Independently validates both front and back assets for paired records.
   */
  public async validateArchiveBundle(bundle: any): Promise<BundleValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!bundle || typeof bundle !== 'object') {
      return {
        isValid: false,
        errors: ['Invalid bundle: not an object.'],
        warnings: [],
        recordsCount: 0,
        assetsCount: 0,
        playableCount: 0,
      };
    }

    if (bundle.version !== 1) {
      errors.push(`Unsupported bundle version: ${bundle.version}. Expected version 1.`);
    }

    if (!Array.isArray(bundle.records)) {
      errors.push('Bundle missing valid records array.');
    }

    if (!Array.isArray(bundle.assets)) {
      errors.push('Bundle missing valid assets array.');
    }

    if (!Array.isArray(bundle.playableCards)) {
      errors.push('Bundle missing valid playableCards array.');
    }

    if (errors.length > 0) {
      return {
        isValid: false,
        errors,
        warnings,
        recordsCount: 0,
        assetsCount: 0,
        playableCount: 0,
      };
    }

    const records: HistoricalCardArchive[] = bundle.records;
    const assets: ArchiveExportAsset[] = bundle.assets;
    const playableCards: PlayableCardDefinition[] = bundle.playableCards;

    // Verify every archive record has an asset and valid checksum
    const existingDbRecords = await this.getAllArchiveRecords();
    const existingArchiveIds = new Set(existingDbRecords.map(r => r.archiveId));
    const bundleArchiveIds = new Set(records.map(r => r.archiveId));

    for (const rec of records) {
      if (!rec.archiveId || !rec.originalFileName || !rec.originalFileChecksum) {
        errors.push(`Record missing required fields (archiveId, originalFileName, or originalFileChecksum): ${JSON.stringify(rec)}`);
        continue;
      }

      // Check Front Asset (or primary single-sided asset)
      const frontKey = rec.frontAsset?.binaryStorageKey || rec.archiveId;
      const frontAsset = assets.find(a => 
        a.archiveId === frontKey || 
        (rec.frontAsset && a.assetId === rec.frontAsset.assetId) ||
        (a.archiveId === rec.archiveId && a.side !== 'BACK')
      );

      if (!frontAsset) {
        errors.push(`Missing front asset binary for record '${rec.originalFileName}' (${rec.archiveId}).`);
      } else if (!frontAsset.base64Data || typeof frontAsset.base64Data !== 'string') {
        errors.push(`Front asset for '${rec.originalFileName}' contains corrupted or empty base64 payload.`);
      } else {
        // Cryptographic verification of front asset content
        try {
          const blob = base64ToBlob(frontAsset.base64Data, frontAsset.mimeType);
          const actualChecksum = await calculateFileChecksum(blob);
          const expectedChecksum = rec.frontAsset?.fileChecksum || rec.originalFileChecksum;
          if (actualChecksum !== expectedChecksum) {
            errors.push(
              `Checksum mismatch on front asset of '${rec.originalFileName}': calculated ${actualChecksum} vs recorded ${expectedChecksum}. Data may be corrupted.`
            );
          }
        } catch (err: any) {
          errors.push(`Failed to decode base64 binary for front asset of '${rec.originalFileName}': ${err.message}`);
        }
      }

      // Check Back Asset if record is paired
      if (rec.backAsset) {
        const backKey = rec.backAsset.binaryStorageKey || rec.backAsset.assetId;
        const backAsset = assets.find(a => 
          a.archiveId === backKey || 
          a.assetId === rec.backAsset?.assetId ||
          (a.side === 'BACK' && (a.archiveId === backKey || a.archiveId === rec.archiveId))
        );

        if (!backAsset) {
          errors.push(`Missing back asset binary for paired card '${rec.originalFileName}' (${rec.archiveId}, back key: ${backKey}).`);
        } else if (!backAsset.base64Data || typeof backAsset.base64Data !== 'string') {
          errors.push(`Back asset for '${rec.originalFileName}' contains corrupted or empty base64 payload.`);
        } else {
          // Cryptographic verification of back asset content
          try {
            const blob = base64ToBlob(backAsset.base64Data, backAsset.mimeType);
            const actualChecksum = await calculateFileChecksum(blob);
            const expectedChecksum = rec.backAsset.fileChecksum;
            if (actualChecksum !== expectedChecksum) {
              errors.push(
                `Checksum mismatch on back asset of '${rec.originalFileName}': calculated ${actualChecksum} vs recorded ${expectedChecksum}. Data may be corrupted.`
              );
            }
          } catch (err: any) {
            errors.push(`Failed to decode base64 binary for back asset of '${rec.originalFileName}': ${err.message}`);
          }
        }
      }
    }

    // Verify all playable cards point to existing or incoming archive records
    for (const card of playableCards) {
      if (!card.playableCardId || !card.displayName) {
        errors.push(`Playable card definition missing ID or displayName.`);
        continue;
      }

      if (card.archiveId) {
        const foundInBundle = bundleArchiveIds.has(card.archiveId);
        const foundInDb = existingArchiveIds.has(card.archiveId);
        if (!foundInBundle && !foundInDb) {
          errors.push(
            `Playable card '${card.displayName}' references non-existent archive record '${card.archiveId}'.`
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recordsCount: records.length,
      assetsCount: assets.length,
      playableCount: playableCards.length,
    };
  }

  /**
   * Imports a backup bundle after full validation.
   * Restoring never silently overwrites existing records.
   * Restores paired physical card records with both front and back binaries atomically.
   * On any failure during restoration, rolls back all newly inserted records and playables.
   */
  public async importArchiveBundle(
    bundle: ArchiveExportBundle
  ): Promise<{ importedCount: number; skippedDuplicates: number; validation: BundleValidationResult }> {
    const validation = await this.validateArchiveBundle(bundle);
    if (!validation.isValid) {
      throw new Error(`Backup bundle restoration failed validation:\n- ${validation.errors.join('\n- ')}`);
    }

    let importedCount = 0;
    let skippedDuplicates = 0;

    const insertedArchiveIds: string[] = [];
    const insertedPlayableIds: string[] = [];

    try {
      for (const rec of bundle.records) {
        const dup = await this.checkDuplicate(rec.originalFileChecksum, rec.sourceDriveFileId);
        if (dup.isDuplicate) {
          skippedDuplicates++;
          continue;
        }

        // Check if archiveId is already registered
        const existing = await this.getArchiveRecord(rec.archiveId);
        if (existing) {
          skippedDuplicates++;
          continue;
        }

        if (rec.frontAsset && rec.backAsset) {
          // Paired physical card restoration
          const frontKey = rec.frontAsset.binaryStorageKey || rec.archiveId;
          const backKey = rec.backAsset.binaryStorageKey || rec.backAsset.assetId;

          const frontAsset = bundle.assets.find(a => 
            a.archiveId === frontKey || 
            a.assetId === rec.frontAsset?.assetId ||
            (a.archiveId === rec.archiveId && a.side !== 'BACK')
          );
          const backAsset = bundle.assets.find(a => 
            a.archiveId === backKey || 
            a.assetId === rec.backAsset?.assetId ||
            (a.side === 'BACK' && (a.archiveId === backKey || a.archiveId === rec.archiveId))
          );

          if (!frontAsset || !backAsset) {
            throw new Error(`Missing binary assets for paired card '${rec.originalFileName}' during restore.`);
          }

          const frontBlob = base64ToBlob(frontAsset.base64Data, frontAsset.mimeType);
          const backBlob = base64ToBlob(backAsset.base64Data, backAsset.mimeType);

          await this.savePairedArchiveRecord(rec, frontBlob, backBlob, null, null);
          insertedArchiveIds.push(rec.archiveId);
          importedCount++;
        } else {
          // Single-sided physical card or template restoration
          const assetKey = rec.frontAsset?.binaryStorageKey || (rec.backAsset ? (rec.backAsset.binaryStorageKey || rec.backAsset.assetId) : rec.archiveId);
          const asset = bundle.assets.find(a => 
            a.archiveId === assetKey || 
            a.archiveId === rec.archiveId ||
            (rec.frontAsset && a.assetId === rec.frontAsset.assetId) ||
            (rec.backAsset && a.assetId === rec.backAsset.assetId)
          );

          if (!asset) {
            throw new Error(`Missing binary asset for '${rec.originalFileName}' during restore.`);
          }

          const blob = base64ToBlob(asset.base64Data, asset.mimeType);
          await this.saveArchiveRecord(rec, blob, null);
          insertedArchiveIds.push(rec.archiveId);
          importedCount++;
        }
      }

      for (const playCard of bundle.playableCards) {
        const existing = await this.getPlayableCard(playCard.playableCardId);
        if (!existing) {
          await this.savePlayableCard(playCard);
          insertedPlayableIds.push(playCard.playableCardId);
        }
      }

      return { importedCount, skippedDuplicates, validation };
    } catch (err: any) {
      // Transactional rollback: purge all partially imported records and playables
      for (const pId of insertedPlayableIds) {
        try {
          await this.deletePlayableCard(pId);
        } catch {
          // ignore cleanup errors
        }
      }
      for (const arcId of insertedArchiveIds) {
        try {
          await this.deleteArchiveRecord(arcId);
        } catch {
          // ignore cleanup errors
        }
      }
      throw new Error(`Restoration failed and was rolled back cleanly: ${err?.message || err}`);
    }
  }

  public async getStorageUsage(): Promise<{ totalBytes: number; recordCount: number; binaryCount: number }> {
    const records = await this.getAllArchiveRecords();
    const totalBytes = records.reduce((acc, r) => acc + (r.originalFileSize || 0), 0);

    return {
      totalBytes,
      recordCount: records.length,
      binaryCount: records.length,
    };
  }

  public async clearAll(): Promise<void> {
    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        this.memRecords.clear();
        this.memBinaries.clear();
        this.memThumbnails.clear();
        this.memPlayable.clear();
        return;
      }
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        [STORES.RECORDS, STORES.BINARIES, STORES.THUMBNAILS, STORES.PLAYABLE], 
        'readwrite'
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      tx.objectStore(STORES.RECORDS).clear();
      tx.objectStore(STORES.BINARIES).clear();
      tx.objectStore(STORES.THUMBNAILS).clear();
      tx.objectStore(STORES.PLAYABLE).clear();
    });
  }
}

// Singleton storage instance
export const archiveStorage = new ArchiveStorage();
