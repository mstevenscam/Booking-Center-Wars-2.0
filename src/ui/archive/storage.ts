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
  StorageStatus,
  BundleValidationResult
} from './types';
import { blobToBase64, base64ToBlob, calculateFileChecksum } from './utils';

const DB_NAME = 'BookingWarsArchiveDB';
const DB_VERSION = 1;

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
      isDevMemoryMode: this.isDevMemoryMode,
    };
  }

  public isPersistentStorageAvailable(): boolean {
    return this.isPersistent;
  }

  public async init(): Promise<void> {
    if (this.db) {
      this.isPersistent = true;
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

        req.onsuccess = () => {
          this.db = req.result;
          this.isPersistent = true;
          this.initError = null;
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

        tx.objectStore(STORES.RECORDS).put(record);
        tx.objectStore(STORES.BINARIES).put({
          archiveId: record.archiveId,
          blob: fileBlob,
          originalFileName: record.originalFileName,
          originalFileType: record.originalFileType,
          checksum: record.originalFileChecksum,
        });

        if (thumbnailBlob) {
          tx.objectStore(STORES.THUMBNAILS).put({
            archiveId: record.archiveId,
            blob: thumbnailBlob,
          });
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
        return Array.from(this.memRecords.values());
      }
      return [];
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.RECORDS, 'readonly');
      const req = tx.objectStore(STORES.RECORDS).getAll();
      req.onsuccess = () => resolve(req.result || []);
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

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        this.memRecords.delete(archiveId);
        this.memBinaries.delete(archiveId);
        this.memThumbnails.delete(archiveId);
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
    });
  }

  public async getArchiveBinary(archiveId: string): Promise<Blob | null> {
    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        const item = this.memBinaries.get(archiveId);
        return item ? item.blob : null;
      }
      return null;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.BINARIES, 'readonly');
      const req = tx.objectStore(STORES.BINARIES).get(archiveId);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  }

  public async getArchiveThumbnail(archiveId: string): Promise<Blob | null> {
    await this.init();

    if (!this.isPersistent || !this.db) {
      if (this.isDevMemoryMode) {
        return this.memThumbnails.get(archiveId) || null;
      }
      return null;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.THUMBNAILS, 'readonly');
      const req = tx.objectStore(STORES.THUMBNAILS).get(archiveId);
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

    const assets: ArchiveExportBundle['assets'] = [];

    for (const record of records) {
      const binaryBlob = await this.getArchiveBinary(record.archiveId);
      if (binaryBlob) {
        const base64Data = await blobToBase64(binaryBlob);
        assets.push({
          archiveId: record.archiveId,
          originalFileName: record.originalFileName,
          mimeType: record.originalFileType,
          base64Data,
        });
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
    const assets: ArchiveExportBundle['assets'] = bundle.assets;
    const playableCards: PlayableCardDefinition[] = bundle.playableCards;

    // 1. Verify every archive record has an asset and valid checksum
    const existingDbRecords = await this.getAllArchiveRecords();
    const existingArchiveIds = new Set(existingDbRecords.map(r => r.archiveId));
    const bundleArchiveIds = new Set(records.map(r => r.archiveId));

    for (const rec of records) {
      if (!rec.archiveId || !rec.originalFileName || !rec.originalFileChecksum) {
        errors.push(`Record missing required fields (archiveId, originalFileName, or originalFileChecksum): ${JSON.stringify(rec)}`);
        continue;
      }

      const asset = assets.find(a => a.archiveId === rec.archiveId);
      if (!asset) {
        errors.push(`Missing original asset binary for record '${rec.originalFileName}' (${rec.archiveId}).`);
        continue;
      }

      if (!asset.base64Data || typeof asset.base64Data !== 'string') {
        errors.push(`Asset for '${rec.originalFileName}' contains corrupted or empty base64 payload.`);
        continue;
      }

      // Cryptographic verification of asset content
      try {
        const blob = base64ToBlob(asset.base64Data, asset.mimeType);
        const actualChecksum = await calculateFileChecksum(blob);
        if (actualChecksum !== rec.originalFileChecksum) {
          errors.push(
            `Checksum mismatch on '${rec.originalFileName}': calculated ${actualChecksum} vs recorded ${rec.originalFileChecksum}. Data may be corrupted.`
          );
        }
      } catch (err: any) {
        errors.push(`Failed to decode base64 binary for '${rec.originalFileName}': ${err.message}`);
      }
    }

    // 2. Verify all playable cards point to existing or incoming archive records
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

      const asset = bundle.assets.find(a => a.archiveId === rec.archiveId);
      if (asset) {
        const blob = base64ToBlob(asset.base64Data, asset.mimeType);
        await this.saveArchiveRecord(rec, blob, null);
        importedCount++;
      }
    }

    for (const playCard of bundle.playableCards) {
      const existing = await this.getPlayableCard(playCard.playableCardId);
      if (!existing) {
        await this.savePlayableCard(playCard);
      }
    }

    return { importedCount, skippedDuplicates, validation };
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
