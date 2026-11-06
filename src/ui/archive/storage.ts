/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Persistent IndexedDB Archive Storage Engine
 * 
 * Features:
 * - Persistent storage of original physical card scans and Photoshop PSD binaries.
 * - Dedicated stores for records, raw binaries, derived thumbnails, and playable card definitions.
 * - Cryptographic SHA-256 and Google Drive File ID duplicate checking.
 * - Zero modification of original file bytes.
 * - Full export/backup and restore engine.
 * - Graceful in-memory fallback for environments without IndexedDB.
 */

import { HistoricalCardArchive, PlayableCardDefinition, ArchiveExportBundle } from './types';
import { blobToBase64, base64ToBlob } from './utils';

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
  private isMemoryFallback = false;

  // In-memory fallback structures
  private memRecords = new Map<string, HistoricalCardArchive>();
  private memBinaries = new Map<string, { archiveId: string; blob: Blob; checksum: string }>();
  private memThumbnails = new Map<string, Blob>();
  private memPlayable = new Map<string, PlayableCardDefinition>();

  public async init(): Promise<void> {
    if (this.db) return;

    // Detect if IndexedDB is available in environment
    const idb = typeof window !== 'undefined' ? window.indexedDB : (globalThis as any).indexedDB;
    if (!idb) {
      this.isMemoryFallback = true;
      return;
    }

    return new Promise((resolve, reject) => {
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
          resolve();
        };

        req.onerror = () => {
          console.warn('IndexedDB failed to open, switching to in-memory fallback:', req.error);
          this.isMemoryFallback = true;
          resolve();
        };
      } catch (err) {
        console.warn('IndexedDB open threw, switching to memory fallback:', err);
        this.isMemoryFallback = true;
        resolve();
      }
    });
  }

  /**
   * Saves an original scanned card or template and its metadata.
   * Original binary bytes remain strictly uncompressed and unaltered.
   */
  public async saveArchiveRecord(
    record: HistoricalCardArchive, 
    fileBlob: Blob, 
    thumbnailBlob?: Blob | null
  ): Promise<void> {
    await this.init();

    if (this.isMemoryFallback || !this.db) {
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

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(
          [STORES.RECORDS, STORES.BINARIES, STORES.THUMBNAILS], 
          'readwrite'
        );

        tx.onerror = () => reject(tx.error || new Error('Failed to save archive record in IndexedDB'));
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

    if (this.isMemoryFallback || !this.db) {
      return this.memRecords.get(archiveId) || null;
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

    if (this.isMemoryFallback || !this.db) {
      return Array.from(this.memRecords.values());
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

    if (this.isMemoryFallback || !this.db) {
      if (!this.memRecords.has(record.archiveId)) {
        throw new Error(`Record ${record.archiveId} not found`);
      }
      this.memRecords.set(record.archiveId, { ...record });
      return;
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

    if (this.isMemoryFallback || !this.db) {
      this.memRecords.delete(archiveId);
      this.memBinaries.delete(archiveId);
      this.memThumbnails.delete(archiveId);
      return;
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

    if (this.isMemoryFallback || !this.db) {
      const item = this.memBinaries.get(archiveId);
      return item ? item.blob : null;
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

    if (this.isMemoryFallback || !this.db) {
      return this.memThumbnails.get(archiveId) || null;
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

    if (this.isMemoryFallback || !this.db) {
      this.memPlayable.set(card.playableCardId, { ...card });
      return;
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

    if (this.isMemoryFallback || !this.db) {
      return this.memPlayable.get(playableCardId) || null;
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

    if (this.isMemoryFallback || !this.db) {
      return Array.from(this.memPlayable.values());
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

    if (this.isMemoryFallback || !this.db) {
      this.memPlayable.delete(playableCardId);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORES.PLAYABLE, 'readwrite');
      const req = tx.objectStore(STORES.PLAYABLE).delete(playableCardId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ==========================================
  // BACKUP EXPORT & RESTORATION
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

  public async importArchiveBundle(
    bundle: ArchiveExportBundle
  ): Promise<{ importedCount: number; skippedDuplicates: number }> {
    let importedCount = 0;
    let skippedDuplicates = 0;

    for (const rec of bundle.records) {
      const dup = await this.checkDuplicate(rec.originalFileChecksum, rec.sourceDriveFileId);
      if (dup.isDuplicate) {
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
      await this.savePlayableCard(playCard);
    }

    return { importedCount, skippedDuplicates };
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

    if (this.isMemoryFallback || !this.db) {
      this.memRecords.clear();
      this.memBinaries.clear();
      this.memThumbnails.clear();
      this.memPlayable.clear();
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
