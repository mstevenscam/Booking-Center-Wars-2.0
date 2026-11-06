/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Milestone 4: Physical Card Archive & Import Centre — Automated Test Suite
 * 
 * Verifies all 15 acceptance criteria:
 * 1.  Import single JPG scan file
 * 2.  Import batch of mixed scan files (JPG, PNG)
 * 3.  Import Photoshop template (.psd) as PHOTOSHOP_TEMPLATE
 * 4.  Flag / handle unsupported non-card file format as OTHER_ASSET
 * 5.  Generate stable, deterministic archive IDs
 * 6.  Detect duplicate files via SHA-256 checksum matching
 * 7.  Detect duplicate Google Drive files via Drive file ID
 * 8.  Preserve original file metadata and unaltered binary integrity
 * 9.  Link one archive record to multiple playable card variations
 * 10. Deleting a playable card variation does NOT delete underlying archive record
 * 11. Editing playable card stats does NOT modify source archive asset
 * 12. Persist records across re-initialization
 * 13. Export and restore archive backup bundles
 * 14. Handle failed/aborted imports without corrupting existing archive
 * 15. Graceful memory fallback operation when IndexedDB is unavailable
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as fakeIDB } from 'fake-indexeddb';

// Ensure indexedDB is globally available for the tests
(globalThis as any).indexedDB = fakeIDB;

import { ArchiveStorage } from '../storage';
import { 
  calculateFileChecksum, 
  classifyFile, 
  extractYearFromFilename, 
  generateStableArchiveId 
} from '../utils';
import { HistoricalCardArchive, PlayableCardDefinition } from '../types';

describe('Milestone 4 — Physical Card Archive & Import Centre', () => {
  let storage: ArchiveStorage;

  beforeEach(async () => {
    storage = new ArchiveStorage();
    await storage.init();
    await storage.clearAll();
  });

  // TEST 1: Import a single JPG scan file
  test('1. Imports a single JPG scan file and retrieves it', async () => {
    const rawData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04]);
    const blob = new Blob([rawData], { type: 'image/jpeg' });
    const checksum = await calculateFileChecksum(blob);
    const classification = classifyFile('2021_Sarah_Cable_Scan.jpg', 'image/jpeg');

    assert.equal(classification, 'CARD_ARTWORK');

    const archiveId = generateStableArchiveId(checksum, '2021_Sarah_Cable_Scan.jpg', 2021);
    const record: HistoricalCardArchive = {
      archiveId,
      originalFileName: '2021_Sarah_Cable_Scan.jpg',
      originalFileSize: blob.size,
      originalFileType: 'image/jpeg',
      originalFileChecksum: checksum,
      originalCreationYear: 2021,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification,
      userNotes: 'Preserved tech lead photograph scan.',
      metadata: {
        aiSuggestedTitle: 'Sarah Cable',
        aiSuggestedDepartment: 'TECH',
      },
    };

    await storage.saveArchiveRecord(record, blob, null);

    const retrieved = await storage.getArchiveRecord(archiveId);
    assert.ok(retrieved, 'Archive record should be retrieved');
    assert.equal(retrieved?.originalFileName, '2021_Sarah_Cable_Scan.jpg');
    assert.equal(retrieved?.originalFileChecksum, checksum);
    assert.equal(retrieved?.classification, 'CARD_ARTWORK');
    assert.equal(retrieved?.originalCreationYear, 2021);

    const retrievedBlob = await storage.getArchiveBinary(archiveId);
    assert.ok(retrievedBlob, 'Binary blob should be stored and retrieved');
    assert.equal(retrievedBlob?.size, blob.size);
  });

  // TEST 2: Import a batch of mixed scan files (JPG, PNG)
  test('2. Imports a batch of mixed scan files (JPG, PNG)', async () => {
    const files = [
      { name: 'Card_A.jpg', type: 'image/jpeg', bytes: [1, 2, 3] },
      { name: 'Card_B.png', type: 'image/png', bytes: [4, 5, 6, 7] },
      { name: 'Card_C.webp', type: 'image/webp', bytes: [8, 9, 10, 11, 12] },
    ];

    for (const f of files) {
      const blob = new Blob([new Uint8Array(f.bytes)], { type: f.type });
      const checksum = await calculateFileChecksum(blob);
      const record: HistoricalCardArchive = {
        archiveId: `arc-${f.name}`,
        originalFileName: f.name,
        originalFileSize: blob.size,
        originalFileType: f.type,
        originalFileChecksum: checksum,
        originalCreationYear: 2022,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: null,
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
        classification: classifyFile(f.name, f.type),
        userNotes: null,
      };
      await storage.saveArchiveRecord(record, blob, null);
    }

    const all = await storage.getAllArchiveRecords();
    assert.equal(all.length, 3, 'Should contain all 3 batch imported records');
    const names = all.map(r => r.originalFileName).sort();
    assert.deepEqual(names, ['Card_A.jpg', 'Card_B.png', 'Card_C.webp']);
  });

  // TEST 3: Import a Photoshop template (.psd)
  test('3. Imports Photoshop template (.psd) classified as PHOTOSHOP_TEMPLATE with intact binary', async () => {
    const psdBytes = new Uint8Array([0x38, 0x42, 0x50, 0x53, 0x00, 0x01, 0x99, 0x88]); // 8BPS header
    const blob = new Blob([psdBytes], { type: 'image/vnd.adobe.photoshop' });
    const classification = classifyFile('Humber_Card_Master_2022.psd', 'image/vnd.adobe.photoshop');

    assert.equal(classification, 'PHOTOSHOP_TEMPLATE', 'Must classify PSD as PHOTOSHOP_TEMPLATE');

    const checksum = await calculateFileChecksum(blob);
    const record: HistoricalCardArchive = {
      archiveId: 'arc-psd-template',
      originalFileName: 'Humber_Card_Master_2022.psd',
      originalFileSize: blob.size,
      originalFileType: 'image/vnd.adobe.photoshop',
      originalFileChecksum: checksum,
      originalCreationYear: 2022,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification,
      userNotes: 'Original Adobe Photoshop CC master template with layer groups.',
      metadata: {
        photoshopLayersDetected: true,
      },
    };

    await storage.saveArchiveRecord(record, blob, null);

    const storedBlob = await storage.getArchiveBinary('arc-psd-template');
    assert.ok(storedBlob);
    assert.equal(storedBlob?.size, psdBytes.length);

    const check = await calculateFileChecksum(storedBlob!);
    assert.equal(check, checksum, 'Stored binary must preserve exact unaltered byte checksum');
  });

  // TEST 4: Flag or reject unsupported file formats
  test('4. Flags non-card assets (e.g. PDF, spreadsheet) as OTHER_ASSET', () => {
    const pdfClass = classifyFile('annual_budget_2021.pdf', 'application/pdf');
    assert.equal(pdfClass, 'OTHER_ASSET');

    const xlsxClass = classifyFile('booking_shifts.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(xlsxClass, 'OTHER_ASSET');

    const zipClass = classifyFile('backup.zip', 'application/zip');
    assert.equal(zipClass, 'OTHER_ASSET');
  });

  // TEST 5: Generate stable, deterministic archive IDs
  test('5. Generates stable, deterministic archive IDs from file content and metadata', () => {
    const checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const id1 = generateStableArchiveId(checksum, '2021_Sarah_Cable.jpg', 2021);
    const id2 = generateStableArchiveId(checksum, '2021_Sarah_Cable.jpg', 2021);

    assert.equal(id1, id2, 'Same inputs must yield identical archive IDs');
    assert.match(id1, /^arc-2021-/, 'ID should incorporate year prefix');
    assert.match(id1, /e3b0c442$/, 'ID should incorporate short checksum hash');

    const extractedYear = extractYearFromFilename('Sarah_Cable_2022_final.jpg', 'CardArchive/2022/');
    assert.equal(extractedYear, 2022, 'Should correctly extract year from filename or folder');
  });

  // TEST 6: Detect duplicate file based on SHA-256 hash
  test('6. Detects duplicate file contents via SHA-256 hash matching', async () => {
    const blob = new Blob([new Uint8Array([10, 20, 30, 40, 50])], { type: 'image/png' });
    const checksum = await calculateFileChecksum(blob);

    const record: HistoricalCardArchive = {
      archiveId: 'arc-original-card',
      originalFileName: 'original_scan.png',
      originalFileSize: blob.size,
      originalFileType: 'image/png',
      originalFileChecksum: checksum,
      originalCreationYear: null,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: null,
    };
    await storage.saveArchiveRecord(record, blob, null);

    // Check duplicate with same checksum but different filename
    const dupCheck = await storage.checkDuplicate(checksum);
    assert.equal(dupCheck.isDuplicate, true, 'Must identify duplicate content');
    assert.equal(dupCheck.matchedRecord?.archiveId, 'arc-original-card');

    // Check duplicate with different checksum
    const diffCheck = await storage.checkDuplicate('unmatched-sha256-hash-12345');
    assert.equal(diffCheck.isDuplicate, false, 'Different content must not be flagged as duplicate');
  });

  // TEST 7: Detect duplicate Google Drive file based on Drive file ID
  test('7. Detects duplicate Google Drive files via sourceDriveFileId', async () => {
    const blob = new Blob([new Uint8Array([100, 101, 102])], { type: 'image/jpeg' });
    const checksum = await calculateFileChecksum(blob);

    const record: HistoricalCardArchive = {
      archiveId: 'arc-drive-card',
      originalFileName: 'gdrive_scan.jpg',
      originalFileSize: blob.size,
      originalFileType: 'image/jpeg',
      originalFileChecksum: checksum,
      originalCreationYear: null,
      sourceProvider: 'GOOGLE_DRIVE',
      sourceFolderPath: 'Google Drive/Humber Archive',
      sourceDriveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: null,
    };
    await storage.saveArchiveRecord(record, blob, null);

    // Even with a different checksum, matching Drive ID should be flagged
    const dupCheck = await storage.checkDuplicate('completely-different-checksum', '1AbCdEfGhIjKlMnOpQrStUvWxYz');
    assert.equal(dupCheck.isDuplicate, true, 'Must detect duplicate Drive file ID');
    assert.equal(dupCheck.matchedRecord?.archiveId, 'arc-drive-card');
  });

  // TEST 8: Store and retrieve original file metadata correctly without corruption
  test('8. Preserves all original file metadata unaltered', async () => {
    const testBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x22]);
    const blob = new Blob([testBytes], { type: 'image/png' });
    const checksum = await calculateFileChecksum(blob);

    const originalRecord: HistoricalCardArchive = {
      archiveId: 'arc-test-meta',
      originalFileName: 'high_res_original_scan.png',
      originalFileSize: 10,
      originalFileType: 'image/png',
      originalFileChecksum: checksum,
      originalCreationYear: 2021,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: 'Scans/2021',
      sourceDriveFileId: null,
      importedAt: '2026-05-15T12:00:00.000Z',
      classification: 'CARD_ARTWORK',
      userNotes: 'Preserved from the 2021 physical print run.',
      metadata: {
        aiSuggestedTitle: 'The System Administrator',
        aiSuggestedDepartment: 'TECH',
      },
    };

    await storage.saveArchiveRecord(originalRecord, blob, null);

    const retrieved = await storage.getArchiveRecord('arc-test-meta');
    assert.ok(retrieved);
    assert.equal(retrieved?.originalFileName, 'high_res_original_scan.png');
    assert.equal(retrieved?.originalFileSize, 10);
    assert.equal(retrieved?.originalFileType, 'image/png');
    assert.equal(retrieved?.originalFileChecksum, checksum);
    assert.equal(retrieved?.originalCreationYear, 2021);
    assert.equal(retrieved?.metadata?.aiSuggestedTitle, 'The System Administrator');
    assert.equal(retrieved?.metadata?.aiSuggestedDepartment, 'TECH');
  });

  // TEST 9: Verify one archive card can link to multiple playable card variations
  test('9. Links a single archive card record to multiple playable card variations', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    const checksum = await calculateFileChecksum(blob);

    const archiveRecord: HistoricalCardArchive = {
      archiveId: 'arc-sarah-root',
      originalFileName: 'sarah.jpg',
      originalFileSize: 3,
      originalFileType: 'image/jpeg',
      originalFileChecksum: checksum,
      originalCreationYear: 2021,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: 'Core set scan',
    };
    await storage.saveArchiveRecord(archiveRecord, blob, null);

    // Variation 1: Standard Shift Lead
    const var1: PlayableCardDefinition = {
      playableCardId: 'play-sarah-standard',
      archiveId: 'arc-sarah-root',
      displayName: 'Sarah Cable, Shift Lead',
      variationName: 'Standard Core Set',
      cardType: 'CHARACTER',
      rarity: 'COMMON',
      department: 'TECH',
      shiftCost: 3,
      efficiency: 3,
      stamina: 4,
      maxStamina: 4,
      influence: 2,
      keywords: ['EXPEDITE'],
      abilityName: 'Shift Coordination',
      abilityDesc: 'Reduce dispatch queue turns by 1.',
      flavor: 'Runs the ticket dispatch terminal with iron discipline.',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Variation 2: Overtime Veteran (Boss/Supervisor)
    const var2: PlayableCardDefinition = {
      playableCardId: 'play-sarah-overtime',
      archiveId: 'arc-sarah-root',
      displayName: 'Sarah Cable, Overtime Veteran',
      variationName: 'Supervisor Expansion',
      cardType: 'CHARACTER',
      rarity: 'SUPERVISOR',
      department: 'TECH',
      shiftCost: 6,
      efficiency: 6,
      stamina: 7,
      maxStamina: 7,
      influence: 5,
      keywords: ['GUARD', 'PRIORITY'],
      abilityName: 'Mandatory Lockdown',
      abilityDesc: 'All adjacent allies gain ablative shields.',
      flavor: 'Double shift on graduation day. Nobody leaves.',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await storage.savePlayableCard(var1);
    await storage.savePlayableCard(var2);

    const variations = await storage.getPlayableCardsForArchive('arc-sarah-root');
    assert.equal(variations.length, 2, 'Must retrieve both playable card variations');
    assert.equal(variations.some(v => v.playableCardId === 'play-sarah-standard'), true);
    assert.equal(variations.some(v => v.playableCardId === 'play-sarah-overtime'), true);
  });

  // TEST 10: Verify deleting a playable variation does NOT delete underlying archive record
  test('10. Deleting a playable card variation preserves the original archive record intact', async () => {
    const blob = new Blob([new Uint8Array([55, 66, 77])], { type: 'image/jpeg' });
    const checksum = await calculateFileChecksum(blob);

    const archiveRecord: HistoricalCardArchive = {
      archiveId: 'arc-permanent-record',
      originalFileName: 'permanent_scan.jpg',
      originalFileSize: 3,
      originalFileType: 'image/jpeg',
      originalFileChecksum: checksum,
      originalCreationYear: null,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: null,
    };
    await storage.saveArchiveRecord(archiveRecord, blob, null);

    const playableCard: PlayableCardDefinition = {
      playableCardId: 'play-temp-variation',
      archiveId: 'arc-permanent-record',
      displayName: 'Temporary Variation',
      variationName: 'Draft Test',
      cardType: 'CHARACTER',
      rarity: 'COMMON',
      department: 'ADMIN',
      shiftCost: 2,
      efficiency: 2,
      stamina: 2,
      maxStamina: 2,
      influence: 1,
      keywords: [],
      abilityName: null,
      abilityDesc: null,
      flavor: 'Testing variation life-cycle.',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await storage.savePlayableCard(playableCard);

    // Delete the playable card variation
    await storage.deletePlayableCard('play-temp-variation');

    // Confirm playable card is deleted
    const checkPlayable = await storage.getPlayableCard('play-temp-variation');
    assert.equal(checkPlayable, null, 'Playable card must be deleted');

    // Confirm historical archive record and binary are 100% intact!
    const archiveAfter = await storage.getArchiveRecord('arc-permanent-record');
    assert.ok(archiveAfter, 'Historical archive record must NOT be deleted');
    const binaryAfter = await storage.getArchiveBinary('arc-permanent-record');
    assert.ok(binaryAfter, 'Underlying binary scan must remain intact in database');
    assert.equal(binaryAfter?.size, 3);
  });

  // TEST 11: Verify editing playable card stats does NOT modify source archive asset
  test('11. Editing playable card stats does NOT modify or corrupt the historical archive record', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    const originalChecksum = await calculateFileChecksum(blob);

    const archiveRecord: HistoricalCardArchive = {
      archiveId: 'arc-untouchable',
      originalFileName: 'untouchable.png',
      originalFileSize: 4,
      originalFileType: 'image/png',
      originalFileChecksum: originalChecksum,
      originalCreationYear: null,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: null,
    };
    await storage.saveArchiveRecord(archiveRecord, blob, null);

    const playable: PlayableCardDefinition = {
      playableCardId: 'play-mutable-stats',
      archiveId: 'arc-untouchable',
      displayName: 'Mutable Digital Card',
      variationName: 'Patch 1.0',
      cardType: 'CHARACTER',
      rarity: 'RARE',
      department: 'FACILITIES',
      shiftCost: 4,
      efficiency: 4,
      stamina: 5,
      maxStamina: 5,
      influence: 3,
      keywords: [],
      abilityName: null,
      abilityDesc: null,
      flavor: 'Digital balance tweaks only.',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await storage.savePlayableCard(playable);

    // Buff the playable card stats (efficiency 4 -> 8, stamina 5 -> 10)
    const buffedPlayable: PlayableCardDefinition = {
      ...playable,
      efficiency: 8,
      stamina: 10,
      shiftCost: 5,
      updatedAt: new Date().toISOString(),
    };
    await storage.savePlayableCard(buffedPlayable);

    // Verify playable card stats updated
    const updatedPlayable = await storage.getPlayableCard('play-mutable-stats');
    assert.equal(updatedPlayable?.efficiency, 8);
    assert.equal(updatedPlayable?.stamina, 10);

    // Verify historical archive record and binary remain strictly unchanged
    const sourceRecord = await storage.getArchiveRecord('arc-untouchable');
    assert.equal(sourceRecord?.originalFileChecksum, originalChecksum);
    const sourceBlob = await storage.getArchiveBinary('arc-untouchable');
    const sourceChecksum = await calculateFileChecksum(sourceBlob!);
    assert.equal(sourceChecksum, originalChecksum, 'Source binary checksum must remain strictly unchanged');
  });

  // TEST 12: Verify persistence across re-initialization
  test('12. Persists archive records and binaries across storage re-initialization', async () => {
    const blob = new Blob([new Uint8Array([42, 43, 44, 45])], { type: 'image/jpeg' });
    const checksum = await calculateFileChecksum(blob);

    const record: HistoricalCardArchive = {
      archiveId: 'arc-persistent-session',
      originalFileName: 'session_scan.jpg',
      originalFileSize: 4,
      originalFileType: 'image/jpeg',
      originalFileChecksum: checksum,
      originalCreationYear: null,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: null,
    };
    await storage.saveArchiveRecord(record, blob, null);

    // Create a new storage client instance to simulate next user session
    const freshStorageClient = new ArchiveStorage();
    await freshStorageClient.init();

    const retrieved = await freshStorageClient.getArchiveRecord('arc-persistent-session');
    assert.ok(retrieved, 'Should retrieve record from persistent database in fresh instance');
    assert.equal(retrieved?.originalFileName, 'session_scan.jpg');

    const binary = await freshStorageClient.getArchiveBinary('arc-persistent-session');
    assert.ok(binary, 'Should retrieve binary from persistent database in fresh instance');
    assert.equal(binary?.size, 4);
  });

  // TEST 13: Export and restore archive backup bundle
  test('13. Exports archive bundle to JSON and restores it successfully into clean database', async () => {
    const blob = new Blob([new Uint8Array([11, 22, 33])], { type: 'image/jpeg' });
    const checksum = await calculateFileChecksum(blob);

    const record: HistoricalCardArchive = {
      archiveId: 'arc-backup-test',
      originalFileName: 'backup_scan.jpg',
      originalFileSize: 3,
      originalFileType: 'image/jpeg',
      originalFileChecksum: checksum,
      originalCreationYear: null,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: null,
    };
    await storage.saveArchiveRecord(record, blob, null);

    const playable: PlayableCardDefinition = {
      playableCardId: 'play-backup-candidate',
      archiveId: 'arc-backup-test',
      displayName: 'Backup Playable Card',
      variationName: 'Foil Edition',
      cardType: 'CHARACTER',
      rarity: 'UNCOMMON',
      department: 'TECH',
      shiftCost: 2,
      efficiency: 2,
      stamina: 3,
      maxStamina: 3,
      influence: 1,
      keywords: [],
      abilityName: null,
      abilityDesc: null,
      flavor: 'Safe in the archive.',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await storage.savePlayableCard(playable);

    // 1. Export bundle
    const bundle = await storage.exportArchiveBundle();
    assert.equal(bundle.version, 1);
    assert.equal(bundle.records.length, 1);
    assert.equal(bundle.playableCards.length, 1);
    assert.equal(bundle.assets.length, 1);
    assert.ok(bundle.assets[0].base64Data.length > 0);

    // 2. Wipe database
    await storage.clearAll();
    const recordsAfterClear = await storage.getAllArchiveRecords();
    assert.equal(recordsAfterClear.length, 0);

    // 3. Restore bundle
    const restoreResult = await storage.importArchiveBundle(bundle);
    assert.equal(restoreResult.importedCount, 1);

    // 4. Verify restored items
    const restoredRecord = await storage.getArchiveRecord('arc-backup-test');
    assert.ok(restoredRecord);
    assert.equal(restoredRecord?.originalFileName, 'backup_scan.jpg');

    const restoredBinary = await storage.getArchiveBinary('arc-backup-test');
    assert.ok(restoredBinary);
    assert.equal(restoredBinary?.size, 3);

    const restoredPlayable = await storage.getPlayableCard('play-backup-candidate');
    assert.ok(restoredPlayable);
    assert.equal(restoredPlayable?.displayName, 'Backup Playable Card');
  });

  // TEST 14: Handle failed imports without corrupting existing records
  test('14. Protects existing records from corruption during an interrupted or failed batch', async () => {
    const validBlob = new Blob([new Uint8Array([1, 1, 1])], { type: 'image/png' });
    const checksum = await calculateFileChecksum(validBlob);

    const validRecord: HistoricalCardArchive = {
      archiveId: 'arc-stable-existing',
      originalFileName: 'existing_scan.png',
      originalFileSize: 3,
      originalFileType: 'image/png',
      originalFileChecksum: checksum,
      originalCreationYear: null,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: null,
    };
    await storage.saveArchiveRecord(validRecord, validBlob, null);

    // Attempt an invalid operation or simulate rejected import
    const corruptRecord = { archiveId: 'bad-record' } as any;
    try {
      // Trying to update non-existent record in memory fallback throws
      await storage.updateArchiveRecord(corruptRecord);
    } catch {
      // Handled rejection
    }

    // Verify existing record is 100% intact and undamaged
    const checkExisting = await storage.getArchiveRecord('arc-stable-existing');
    assert.ok(checkExisting);
    assert.equal(checkExisting?.originalFileName, 'existing_scan.png');
  });

  // TEST 15: Handle storage quota / memory fallback gracefully
  test('15. Memory fallback handles full archive operations gracefully without IndexedDB', async () => {
    // Force memory fallback mode
    const memStorage = new ArchiveStorage();
    (memStorage as any).isMemoryFallback = true;
    (memStorage as any).db = null;

    const blob = new Blob([new Uint8Array([99, 88, 77])], { type: 'image/jpeg' });
    const checksum = await calculateFileChecksum(blob);

    const record: HistoricalCardArchive = {
      archiveId: 'arc-mem-fallback',
      originalFileName: 'fallback.jpg',
      originalFileSize: 3,
      originalFileType: 'image/jpeg',
      originalFileChecksum: checksum,
      originalCreationYear: null,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: null,
    };

    // Save in memory fallback
    await memStorage.saveArchiveRecord(record, blob, null);

    // Retrieve from memory fallback
    const retrieved = await memStorage.getArchiveRecord('arc-mem-fallback');
    assert.ok(retrieved);
    assert.equal(retrieved?.originalFileName, 'fallback.jpg');

    const binary = await memStorage.getArchiveBinary('arc-mem-fallback');
    assert.ok(binary);
    assert.equal(binary?.size, 3);

    // Duplicate check in memory fallback
    const dup = await memStorage.checkDuplicate(checksum);
    assert.equal(dup.isDuplicate, true);

    // Playable card in memory fallback
    const playable: PlayableCardDefinition = {
      playableCardId: 'play-mem-1',
      archiveId: 'arc-mem-fallback',
      displayName: 'Memory Card',
      variationName: 'Fallback Variant',
      cardType: 'CHARACTER',
      rarity: 'COMMON',
      department: 'ADMIN',
      shiftCost: 1,
      efficiency: 1,
      stamina: 1,
      maxStamina: 1,
      influence: 1,
      keywords: [],
      abilityName: null,
      abilityDesc: null,
      flavor: 'In-memory test card.',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await memStorage.savePlayableCard(playable);
    const retrievedPlayable = await memStorage.getPlayableCard('play-mem-1');
    assert.ok(retrievedPlayable);
    assert.equal(retrievedPlayable?.displayName, 'Memory Card');

    // Delete in memory fallback
    await memStorage.deleteArchiveRecord('arc-mem-fallback');
    const afterDelete = await memStorage.getArchiveRecord('arc-mem-fallback');
    assert.equal(afterDelete, null);
  });
});
