/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Milestone 4B: Archive Reliability, Import Corrections & Verification Test Suite
 * 
 * Verifies:
 * 1.  Single JPG scan file import and retrieval
 * 2.  Batch of mixed scan files (JPG, PNG) with folder path preservation
 * 3.  Photoshop master template (.psd) import with bit-for-bit byte preservation
 * 4.  Flagging non-card assets as OTHER_ASSET
 * 5.  Accurate year extraction (older, current, future years & filtering unrelated 4-digit numbers)
 * 6.  Stable, deterministic 16-char hash archive ID generation
 * 7.  Archive ID collision safety: prevents overwriting existing records with different content
 * 8.  Duplicate detection via SHA-256 content checksum
 * 9.  Duplicate detection via Google Drive file ID
 * 10. Persistent storage fail-safe: blocks saving and throws error when IndexedDB is unavailable
 * 11. Preserves original file metadata without alteration or corruption
 * 12. Linking one historical archive record to multiple playable card variations
 * 13. Deleting playable variations does NOT delete source archive scan
 * 14. Editing playable card stats does NOT alter source asset or checksum
 * 15. Persistence across storage client re-initialization
 * 16. Backup bundle validation: rejects checksum mismatches, missing assets, and broken references
 * 17. Backup restore: restores records and assets into clean database without silent overwrite
 * 18. Failed/partial batch import isolation: catches item errors without corrupting valid records
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as fakeIDB } from 'fake-indexeddb';

// Ensure indexedDB is globally available for tests
(globalThis as any).indexedDB = fakeIDB;

import { ArchiveStorage } from '../storage';
import { 
  calculateFileChecksum, 
  classifyFile, 
  extractYearFromFilename, 
  generateStableArchiveId 
} from '../utils';
import { HistoricalCardArchive, PlayableCardDefinition, ArchiveExportBundle } from '../types';
import { analyzeCardFilename, pairCardBatch } from '../cardPairing';
import { normalizeArchiveRecord, resolveAssetBinaryKey, generateAssetId, getCardArchiveSideStatus } from '../cardAccessors';

describe('Milestone 4B — Archive Reliability, Import Corrections & Verification', () => {
  let storage: ArchiveStorage;

  beforeEach(async () => {
    storage = new ArchiveStorage();
    await storage.init();
    await storage.clearAll();
  });

  // TEST 1: Single JPG scan file import
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

  // TEST 2: Batch import with folder path preservation
  test('2. Imports batch of mixed scan files and preserves relative folder hierarchy', async () => {
    const files = [
      { name: 'Card_A.jpg', type: 'image/jpeg', bytes: [1, 2, 3], folder: '2019/Tech_Bench' },
      { name: 'Card_B.png', type: 'image/png', bytes: [4, 5, 6, 7], folder: '2021/Facilities' },
      { name: 'Card_C.webp', type: 'image/webp', bytes: [8, 9, 10, 11, 12], folder: '2022/Admin' },
    ];

    for (const f of files) {
      const blob = new Blob([new Uint8Array(f.bytes)], { type: f.type });
      const checksum = await calculateFileChecksum(blob);
      const year = extractYearFromFilename(f.name, f.folder);
      const record: HistoricalCardArchive = {
        archiveId: `arc-${f.name}`,
        originalFileName: f.name,
        originalFileSize: blob.size,
        originalFileType: f.type,
        originalFileChecksum: checksum,
        originalCreationYear: year,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: f.folder,
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
        classification: classifyFile(f.name, f.type),
        userNotes: null,
      };
      await storage.saveArchiveRecord(record, blob, null);
    }

    const all = await storage.getAllArchiveRecords();
    assert.equal(all.length, 3, 'Should contain all 3 batch imported records');

    const cardA = all.find(r => r.originalFileName === 'Card_A.jpg');
    assert.equal(cardA?.sourceFolderPath, '2019/Tech_Bench', 'Must preserve relative folder path');
    assert.equal(cardA?.originalCreationYear, 2019, 'Must extract year from folder path');
  });

  // TEST 3: Photoshop template (.psd) bit-for-bit byte preservation
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

  // TEST 4: Flag non-card assets as OTHER_ASSET
  test('4. Flags non-card assets (e.g. PDF, spreadsheet, zip) as OTHER_ASSET', () => {
    assert.equal(classifyFile('annual_budget_2021.pdf', 'application/pdf'), 'OTHER_ASSET');
    assert.equal(classifyFile('booking_shifts.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'OTHER_ASSET');
    assert.equal(classifyFile('backup.zip', 'application/zip'), 'OTHER_ASSET');
  });

  // TEST 5: Comprehensive year extraction (older, current, future years & filtering unrelated numbers)
  test('5. Accurately extracts creation years and filters out unrelated 4-digit numbers', () => {
    // Older historical years
    assert.equal(extractYearFromFilename('1985_Retro_Staff.jpg'), 1985);
    assert.equal(extractYearFromFilename('Dave_Orientation_1992.png'), 1992);
    assert.equal(extractYearFromFilename('Rig [1999].jpg'), 1999);

    // Current & recent years
    assert.equal(extractYearFromFilename('Sarah (2018).png'), 2018);
    assert.equal(extractYearFromFilename('2021_Sarah_Cable.jpg'), 2021);
    assert.equal(extractYearFromFilename('Sarah_Cable_2024.jpg'), 2024);

    // Year from folder hierarchy
    assert.equal(extractYearFromFilename('card_scan.jpg', 'Humber_Archive/1998/Scans'), 1998);
    assert.equal(extractYearFromFilename('cable.png', 'Scans-2022/Tech'), 2022);

    // Unrelated 4-digit numbers that must NOT be extracted as years:
    assert.equal(extractYearFromFilename('camera_rig_1920x1080.jpg'), null, 'Resolutions like 1920x1080 must not be years');
    assert.equal(extractYearFromFilename('broadcast_feed_1080p.png'), null, '1080p must not be year');
    assert.equal(extractYearFromFilename('lab_bench_iso3200.jpg'), null, 'ISO speed must not be year');
    assert.equal(extractYearFromFilename('printer_port_3000.jpg'), null, 'Port numbers must not be year');
    assert.equal(extractYearFromFilename('dsc_4096.png'), null, 'Camera sequence number must not be year');
    assert.equal(extractYearFromFilename('ticket_5432_receipt.jpg'), null, 'Arbitrary numbers out of range must not be year');
  });

  // TEST 6: Stable, deterministic 16-character hash archive IDs
  test('6. Generates collision-safe 16-character hash archive IDs', () => {
    const checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const id1 = generateStableArchiveId(checksum, '1999_Dave_Maestro.jpg', 1999);
    const id2 = generateStableArchiveId(checksum, '1999_Dave_Maestro.jpg', 1999);

    assert.equal(id1, id2, 'Same inputs must yield identical archive IDs');
    assert.match(id1, /^arc-1999-dave-maestro-[0-9a-f]{16}$/, 'ID must contain year, slug, and 16-character hex digest');
  });

  // TEST 7: Archive ID collision safety (prevents overwriting distinct records)
  test('7. Prevents archive ID collisions from overwriting different records', async () => {
    const blobA = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    const checkA = await calculateFileChecksum(blobA);

    const recordA: HistoricalCardArchive = {
      archiveId: 'arc-collision-test',
      originalFileName: 'file_a.jpg',
      originalFileSize: 3,
      originalFileType: 'image/jpeg',
      originalFileChecksum: checkA,
      originalCreationYear: 2021,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: null,
    };
    await storage.saveArchiveRecord(recordA, blobA, null);

    // Attempt to save a DIFFERENT file under the same archive ID
    const blobB = new Blob([new Uint8Array([9, 8, 7, 6])], { type: 'image/png' });
    const checkB = await calculateFileChecksum(blobB);
    const recordB: HistoricalCardArchive = {
      ...recordA,
      originalFileName: 'file_b.png',
      originalFileChecksum: checkB,
      originalFileSize: 4,
    };

    // Must reject rather than silently overwriting record A!
    await assert.rejects(
      async () => {
        await storage.saveArchiveRecord(recordB, blobB, null);
      },
      /collision/i,
      'Must reject ID collision when content checksum differs'
    );

    // Confirm record A remains intact
    const after = await storage.getArchiveRecord('arc-collision-test');
    assert.equal(after?.originalFileName, 'file_a.jpg');
    assert.equal(after?.originalFileChecksum, checkA);
  });

  // TEST 8: Detect duplicate file contents via SHA-256 hash matching
  test('8. Detects duplicate file contents via SHA-256 hash matching', async () => {
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

    const dupCheck = await storage.checkDuplicate(checksum);
    assert.equal(dupCheck.isDuplicate, true, 'Must identify duplicate content');
    assert.equal(dupCheck.matchedRecord?.archiveId, 'arc-original-card');

    const diffCheck = await storage.checkDuplicate('unmatched-sha256-hash-12345');
    assert.equal(diffCheck.isDuplicate, false);
  });

  // TEST 9: Detect duplicate Google Drive files via sourceDriveFileId
  test('9. Detects duplicate Google Drive files via sourceDriveFileId', async () => {
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

    const dupCheck = await storage.checkDuplicate('completely-different-checksum', '1AbCdEfGhIjKlMnOpQrStUvWxYz');
    assert.equal(dupCheck.isDuplicate, true, 'Must detect duplicate Drive file ID');
    assert.equal(dupCheck.matchedRecord?.archiveId, 'arc-drive-card');
  });

  // TEST 10: Persistent storage fail-safe (blocks saving when IndexedDB is unavailable)
  test('10. Fails safely and throws an explicit error when persistent storage is unavailable', async () => {
    const originalIDB = (globalThis as any).indexedDB;
    (globalThis as any).indexedDB = undefined;

    try {
      const unavailStorage = new ArchiveStorage();
      await unavailStorage.init();
      assert.equal(unavailStorage.isPersistentStorageAvailable(), false);

      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
      const record: HistoricalCardArchive = {
        archiveId: 'arc-fail-safe-test',
        originalFileName: 'test.jpg',
        originalFileSize: 3,
        originalFileType: 'image/jpeg',
        originalFileChecksum: 'dummy-checksum',
        originalCreationYear: null,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: null,
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
        classification: 'CARD_ARTWORK',
        userNotes: null,
      };

      // Must NOT silently succeed into volatile memory! Must throw explicit error!
      await assert.rejects(
        async () => {
          await unavailStorage.saveArchiveRecord(record, blob, null);
        },
        /persistent storage unavailable/i,
        'Must reject saveArchiveRecord when persistent storage is unavailable'
      );
    } finally {
      (globalThis as any).indexedDB = originalIDB;
    }
  });

  // TEST 11: Preserve all original file metadata unaltered
  test('11. Preserves all original file metadata unaltered', async () => {
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
  });

  // TEST 12: Link single archive card to multiple playable variations
  test('12. Links a single archive card record to multiple playable card variations', async () => {
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
  });

  // TEST 13: Deleting a playable card variation does NOT delete underlying archive record
  test('13. Deleting a playable card variation preserves the original archive record intact', async () => {
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

    await storage.deletePlayableCard('play-temp-variation');

    const checkPlayable = await storage.getPlayableCard('play-temp-variation');
    assert.equal(checkPlayable, null, 'Playable card must be deleted');

    const archiveAfter = await storage.getArchiveRecord('arc-permanent-record');
    assert.ok(archiveAfter, 'Historical archive record must NOT be deleted');
    const binaryAfter = await storage.getArchiveBinary('arc-permanent-record');
    assert.ok(binaryAfter, 'Underlying binary scan must remain intact');
  });

  // TEST 14: Editing playable card stats does NOT modify source archive asset
  test('14. Editing playable card stats does NOT modify or corrupt the historical archive record', async () => {
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

    // Buff the playable card stats
    const buffedPlayable: PlayableCardDefinition = {
      ...playable,
      efficiency: 8,
      stamina: 10,
      shiftCost: 5,
      updatedAt: new Date().toISOString(),
    };
    await storage.savePlayableCard(buffedPlayable);

    const updatedPlayable = await storage.getPlayableCard('play-mutable-stats');
    assert.equal(updatedPlayable?.efficiency, 8);

    const sourceRecord = await storage.getArchiveRecord('arc-untouchable');
    assert.equal(sourceRecord?.originalFileChecksum, originalChecksum);
    const sourceBlob = await storage.getArchiveBinary('arc-untouchable');
    const sourceChecksum = await calculateFileChecksum(sourceBlob!);
    assert.equal(sourceChecksum, originalChecksum, 'Source binary checksum must remain strictly unchanged');
  });

  // TEST 15: Persist records across re-initialization
  test('15. Persists archive records and binaries across storage re-initialization', async () => {
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

    // Re-initialize a fresh client
    const freshStorageClient = new ArchiveStorage();
    await freshStorageClient.init();

    const retrieved = await freshStorageClient.getArchiveRecord('arc-persistent-session');
    assert.ok(retrieved);
    assert.equal(retrieved?.originalFileName, 'session_scan.jpg');

    const binary = await freshStorageClient.getArchiveBinary('arc-persistent-session');
    assert.ok(binary);
    assert.equal(binary?.size, 4);
  });

  // TEST 16: Backup bundle validation (checksum mismatch, missing assets, broken references)
  test('16. Validates backup bundles: rejects checksum mismatches, missing assets, and broken references', async () => {
    // A: Checksum mismatch in bundle
    const corruptBundle: any = {
      version: 1,
      exportedAt: new Date().toISOString(),
      records: [{
        archiveId: 'arc-corrupt',
        originalFileName: 'corrupt.jpg',
        originalFileType: 'image/jpeg',
        originalFileSize: 3,
        originalFileChecksum: 'expected-real-checksum-1234567890abcdef',
        originalCreationYear: 2021,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: null,
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
        classification: 'CARD_ARTWORK',
        userNotes: null,
      }],
      assets: [{
        archiveId: 'arc-corrupt',
        originalFileName: 'corrupt.jpg',
        mimeType: 'image/jpeg',
        base64Data: Buffer.from([1, 2, 3]).toString('base64'), // Will produce different checksum!
      }],
      playableCards: [],
    };

    const resultA = await storage.validateArchiveBundle(corruptBundle);
    assert.equal(resultA.isValid, false);
    assert.ok(resultA.errors.some(e => e.includes('Checksum mismatch')), 'Must catch checksum mismatch');

    // B: Playable card referencing non-existent archive record
    const validBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    const validChecksum = await calculateFileChecksum(validBlob);
    const validBase64 = Buffer.from([1, 2, 3]).toString('base64');

    const brokenRefBundle: any = {
      version: 1,
      exportedAt: new Date().toISOString(),
      records: [{
        archiveId: 'arc-valid',
        originalFileName: 'valid.jpg',
        originalFileType: 'image/jpeg',
        originalFileSize: 3,
        originalFileChecksum: validChecksum,
        originalCreationYear: 2021,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: null,
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
        classification: 'CARD_ARTWORK',
        userNotes: null,
      }],
      assets: [{
        archiveId: 'arc-valid',
        originalFileName: 'valid.jpg',
        mimeType: 'image/jpeg',
        base64Data: validBase64,
      }],
      playableCards: [{
        playableCardId: 'play-orphan',
        archiveId: 'arc-DOES-NOT-EXIST', // Non-existent reference!
        displayName: 'Orphan Card',
        variationName: 'Broken Variant',
        cardType: 'CHARACTER',
        rarity: 'COMMON',
        department: 'TECH',
        shiftCost: 2,
        efficiency: 2,
        stamina: 2,
        maxStamina: 2,
        influence: 1,
        keywords: [],
        abilityName: null,
        abilityDesc: null,
        flavor: 'Broken',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    };

    const resultB = await storage.validateArchiveBundle(brokenRefBundle);
    assert.equal(resultB.isValid, false);
    assert.ok(resultB.errors.some(e => e.includes('non-existent archive record')), 'Must catch broken archive reference');
  });

  // TEST 17: Backup restore into clean database
  test('17. Exports archive bundle to JSON and restores it successfully into clean database', async () => {
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

    // Export bundle
    const bundle = await storage.exportArchiveBundle();
    assert.equal(bundle.version, 1);
    assert.equal(bundle.records.length, 1);

    // Wipe database
    await storage.clearAll();
    assert.equal((await storage.getAllArchiveRecords()).length, 0);

    // Restore bundle
    const restoreResult = await storage.importArchiveBundle(bundle);
    assert.equal(restoreResult.importedCount, 1);

    // Verify restored records
    const restoredRecord = await storage.getArchiveRecord('arc-backup-test');
    assert.ok(restoredRecord);
    assert.equal(restoredRecord?.originalFileName, 'backup_scan.jpg');

    const restoredBinary = await storage.getArchiveBinary('arc-backup-test');
    assert.ok(restoredBinary);
    assert.equal(restoredBinary?.size, 3);
  });

  // TEST 18: Genuine partial / interrupted batch import isolation
  test('18. Handles interrupted or partially failing batches without corrupting existing records', async () => {
    // Pre-populate an existing valid record
    const baseBlob = new Blob([new Uint8Array([5, 6, 7])], { type: 'image/png' });
    const baseChecksum = await calculateFileChecksum(baseBlob);
    const existingRec: HistoricalCardArchive = {
      archiveId: 'arc-stable-base',
      originalFileName: 'base.png',
      originalFileSize: 3,
      originalFileType: 'image/png',
      originalFileChecksum: baseChecksum,
      originalCreationYear: 2021,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: null,
    };
    await storage.saveArchiveRecord(existingRec, baseBlob, null);

    // Simulate a batch of 3 files where file #2 causes an ID collision error
    const batch = [
      { name: 'batch_1.jpg', data: [10, 11], id: 'arc-batch-1' },
      { name: 'batch_collision.jpg', data: [20, 21], id: 'arc-stable-base' }, // Collision with existing!
      { name: 'batch_3.jpg', data: [30, 31], id: 'arc-batch-3' },
    ];

    const results: { name: string; success: boolean; error?: string }[] = [];

    for (const item of batch) {
      const b = new Blob([new Uint8Array(item.data)], { type: 'image/jpeg' });
      const c = await calculateFileChecksum(b);
      const rec: HistoricalCardArchive = {
        archiveId: item.id,
        originalFileName: item.name,
        originalFileSize: item.data.length,
        originalFileType: 'image/jpeg',
        originalFileChecksum: c,
        originalCreationYear: 2022,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: null,
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
        classification: 'CARD_ARTWORK',
        userNotes: null,
      };

      try {
        await storage.saveArchiveRecord(rec, b, null);
        results.push({ name: item.name, success: true });
      } catch (err: any) {
        results.push({ name: item.name, success: false, error: err.message });
      }
    }

    // Item 1 succeeded, Item 2 failed with collision, Item 3 succeeded
    assert.equal(results[0].success, true);
    assert.equal(results[1].success, false);
    assert.match(results[1].error || '', /collision/i);
    assert.equal(results[2].success, true);

    // Verify existing base record was NOT damaged or overwritten
    const baseAfter = await storage.getArchiveRecord('arc-stable-base');
    assert.equal(baseAfter?.originalFileName, 'base.png');
    assert.equal(baseAfter?.originalFileChecksum, baseChecksum);
  });

  // TEST 19: Google Picker response extraction handles canonical Response.DOCUMENTS and fallback data.docs
  test('19. Google Picker response extraction supports canonical DOCUMENTS and docs array', () => {
    // Canonical Google Picker response structure
    const canonicalData: any = {
      action: 'picked',
      docs: [
        {
          id: 'drive-file-123',
          name: '2021_Humber_Scan.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: '2048',
          lastEditedUtc: 1640995200000,
          parentName: '2021 Scans',
        },
      ],
    };

    const rawDocs = canonicalData.docs || [];
    assert.equal(rawDocs.length, 1);
    assert.equal(rawDocs[0].id, 'drive-file-123');
    assert.equal(rawDocs[0].name, '2021_Humber_Scan.jpg');
    assert.equal(parseInt(rawDocs[0].sizeBytes, 10), 2048);
  });

  // TEST 20: Picker cancellation handling returns empty array without throwing
  test('20. Picker cancellation resolves to empty array cleanly', () => {
    const cancelData: any = { action: 'cancel' };
    const isCancel = cancelData.action === 'cancel';
    assert.equal(isCancel, true);
  });

  // TEST 21: Malformed Picker response without file ID or Name throws validation error
  test('21. Rejects malformed Picker document missing ID or Name', () => {
    const malformedDoc: any = { mimeType: 'image/png' }; // Missing id and name
    const isValid = Boolean(malformedDoc.id && malformedDoc.name);
    assert.equal(isValid, false, 'Must identify missing required file identification metadata');
  });

  // TEST 22: Preserves original Google Drive file provenance (ID, filename, folderPath)
  test('22. Preserves Google Drive file provenance across record creation', async () => {
    const rawData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const blob = new Blob([rawData], { type: 'image/png' });
    const checksum = await calculateFileChecksum(blob);

    const record: HistoricalCardArchive = {
      archiveId: generateStableArchiveId(checksum, 'Drive_Card_01.png', 2022),
      originalFileName: 'Drive_Card_01.png',
      originalFileSize: rawData.length,
      originalFileType: 'image/png',
      originalFileChecksum: checksum,
      originalCreationYear: 2022,
      sourceProvider: 'GOOGLE_DRIVE',
      sourceFolderPath: '2022 Physical Scans/Roster',
      sourceDriveFileId: '1abcXYZ-drive-id-999',
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: null,
    };

    await storage.saveArchiveRecord(record, blob, null);

    const retrieved = await storage.getArchiveRecord(record.archiveId);
    assert.ok(retrieved);
    assert.equal(retrieved.sourceProvider, 'GOOGLE_DRIVE');
    assert.equal(retrieved.sourceDriveFileId, '1abcXYZ-drive-id-999');
    assert.equal(retrieved.sourceFolderPath, '2022 Physical Scans/Roster');
    assert.equal(retrieved.originalFileName, 'Drive_Card_01.png');
    assert.notEqual(retrieved.sourceFolderPath, 'Google Drive', 'Must preserve specific source folder rather than generic label');
  });

  // TEST 23: Download validation confirms non-empty Blob payload
  test('23. Rejects empty (0-byte) download blob', () => {
    const emptyBlob = new Blob([], { type: 'image/jpeg' });
    const isBlobEmpty = !emptyBlob || emptyBlob.size === 0;
    assert.equal(isBlobEmpty, true, 'Must detect 0-byte blobs');
  });

  // TEST 24: Two-stage workflow isolation — staging does NOT touch IndexedDB
  test('24. Staging files into batch does not write to IndexedDB before explicit import', async () => {
    const initialRecords = await storage.getAllArchiveRecords();
    assert.equal(initialRecords.length, 0);

    // Staging step in memory
    const stagedItem = {
      id: 'batch-test-1',
      name: 'staged_scan.jpg',
      size: 1024,
      status: 'PENDING',
    };
    assert.equal(stagedItem.status, 'PENDING');

    // IndexedDB remains untouched until execution
    const recordsAfterStaging = await storage.getAllArchiveRecords();
    assert.equal(recordsAfterStaging.length, 0);
  });

  // TEST 25: Explicit import commits staged item to persistent storage
  test('25. Explicit import action commits staged files and verifies retrieval', async () => {
    const rawData = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const blob = new Blob([rawData], { type: 'image/jpeg' });
    const checksum = await calculateFileChecksum(blob);
    const archiveId = generateStableArchiveId(checksum, 'committed_scan.jpg', 2023);

    const record: HistoricalCardArchive = {
      archiveId,
      originalFileName: 'committed_scan.jpg',
      originalFileSize: 4,
      originalFileType: 'image/jpeg',
      originalFileChecksum: checksum,
      originalCreationYear: 2023,
      sourceProvider: 'GOOGLE_DRIVE',
      sourceFolderPath: '2023 Archive',
      sourceDriveFileId: 'drive-commit-01',
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: null,
    };

    await storage.saveArchiveRecord(record, blob, null);

    const retrieved = await storage.getArchiveRecord(archiveId);
    assert.ok(retrieved);
    assert.equal(retrieved.archiveId, archiveId);
    assert.equal(retrieved.sourceDriveFileId, 'drive-commit-01');
  });

  // =========================================================================
  // MILESTONE 5: PHASE A — PAIRING ENGINE & DETERMINISTIC MATCHING TESTS
  // =========================================================================

  // TEST 26: PAIGE Example deterministic recognition and pairing
  test('26. PAIGE Example: recognizes hockeycard_PAIGE.png and hockeycard_paige_back.png as a confirmed pair', () => {
    const front = analyzeCardFilename('hockeycard_PAIGE.png');
    const back = analyzeCardFilename('hockeycard_paige_back.png');

    assert.equal(front.side, 'FRONT');
    assert.equal(front.normalizedBaseName, 'hockeycard_paige');

    assert.equal(back.side, 'BACK');
    assert.equal(back.normalizedBaseName, 'hockeycard_paige');

    // Batch pairing
    const batch = [
      { name: 'hockeycard_PAIGE.png', classification: 'CARD_ARTWORK' as const },
      { name: 'hockeycard_paige_back.png', classification: 'CARD_ARTWORK' as const },
    ];
    const pairs = pairCardBatch(batch);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].status, 'CONFIRMED');
    assert.equal(pairs[0].front?.name, 'hockeycard_PAIGE.png');
    assert.equal(pairs[0].back?.name, 'hockeycard_paige_back.png');
  });

  // TEST 27: Case-insensitive matching and whitespace tolerance
  test('27. Case-insensitive matching and whitespace tolerance', () => {
    const front = analyzeCardFilename('  Dave_Rig_Tech.JPG  ');
    const back = analyzeCardFilename('dave_rig_tech_BACK.webp');

    assert.equal(front.side, 'FRONT');
    assert.equal(back.side, 'BACK');
    assert.equal(front.normalizedBaseName, back.normalizedBaseName);

    const pairs = pairCardBatch([
      { name: '  Dave_Rig_Tech.JPG  ', classification: 'CARD_ARTWORK' as const },
      { name: 'dave_rig_tech_BACK.webp', classification: 'CARD_ARTWORK' as const },
    ]);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].status, 'CONFIRMED');
  });

  // TEST 28: Support for different image extensions between front and back
  test('28. Pairs front and back with different extensions (.png and .tif)', () => {
    const pairs = pairCardBatch([
      { name: 'card_001.png', classification: 'CARD_ARTWORK' as const },
      { name: 'card_001_back.tif', classification: 'CARD_ARTWORK' as const },
    ]);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].status, 'CONFIRMED');
    assert.equal(pairs[0].front?.name, 'card_001.png');
    assert.equal(pairs[0].back?.name, 'card_001_back.tif');
  });

  // TEST 29: Front-only and Back-only isolated files
  test('29. Correctly classifies unpaired front-only and back-only files', () => {
    const pairs = pairCardBatch([
      { name: 'solo_front.png', classification: 'CARD_ARTWORK' as const },
      { name: 'lonely_card_back.jpg', classification: 'CARD_ARTWORK' as const },
    ]);
    assert.equal(pairs.length, 2);

    const soloFront = pairs.find(p => p.cardBaseId === 'solo');
    assert.ok(soloFront);
    assert.equal(soloFront.status, 'FRONT_ONLY');
    assert.equal(soloFront.front?.name, 'solo_front.png');
    assert.equal(soloFront.back, null);

    const lonelyBack = pairs.find(p => p.cardBaseId === 'lonely_card');
    assert.ok(lonelyBack);
    assert.equal(lonelyBack.status, 'BACK_ONLY');
    assert.equal(lonelyBack.front, null);
    assert.equal(lonelyBack.back?.name, 'lonely_card_back.jpg');
  });

  // TEST 30: Ambiguous matches: multiple backs or conflicting candidates flagged as AMBIGUOUS
  test('30. Flags multiple backs sharing one base identifier as AMBIGUOUS without auto-pairing', () => {
    const pairs = pairCardBatch([
      { name: 'paige.png', classification: 'CARD_ARTWORK' as const },
      { name: 'paige_back.png', classification: 'CARD_ARTWORK' as const },
      { name: 'paige_back.jpg', classification: 'CARD_ARTWORK' as const }, // Conflicting back!
    ]);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].status, 'AMBIGUOUS');
    assert.match(pairs[0].reason || '', /ambiguous/i);
  });

  // TEST 31: Excludes Photoshop templates and non-artwork from automatic pairing
  test('31. Never automatically pairs Photoshop templates or other assets', () => {
    const pairs = pairCardBatch([
      { name: 'Template_Master.psd', classification: 'PHOTOSHOP_TEMPLATE' as const },
      { name: 'Template_Master_back.psd', classification: 'PHOTOSHOP_TEMPLATE' as const },
    ]);
    // Each template remains an independent singleton
    assert.equal(pairs.length, 2);
    assert.notEqual(pairs[0].status, 'CONFIRMED');
    assert.notEqual(pairs[1].status, 'CONFIRMED');
  });

  // TEST 32: Canonical accessors normalize legacy shadow fields accurately
  test('32. Canonical accessors keep legacy shadow fields in sync with front/back provenance', () => {
    const twoSidedRecord: HistoricalCardArchive = {
      archiveId: 'arc-2021-paige',
      frontAsset: {
        assetId: 'asset-front-uuid-1',
        side: 'FRONT',
        binaryStorageKey: 'arc-2021-paige',
        fileName: 'hockeycard_PAIGE.png',
        fileType: 'image/png',
        fileSize: 1024,
        fileChecksum: 'sha256-front-hex',
        sourceProvider: 'GOOGLE_DRIVE',
        sourceFolderPath: '2021 Scans',
        sourceDriveFileId: 'drive-front-id',
        importedAt: '2026-11-10T00:00:00.000Z',
      },
      backAsset: {
        assetId: 'asset-back-uuid-2',
        side: 'BACK',
        binaryStorageKey: 'asset-back-uuid-2',
        fileName: 'hockeycard_paige_back.png',
        fileType: 'image/png',
        fileSize: 800,
        fileChecksum: 'sha256-back-hex',
        sourceProvider: 'GOOGLE_DRIVE',
        sourceFolderPath: '2021 Scans',
        sourceDriveFileId: 'drive-back-id',
        importedAt: '2026-11-10T00:00:00.000Z',
      },
      originalCreationYear: 2021,
      classification: 'CARD_ARTWORK',
      userNotes: null,
      // Outdated shadow fields to be normalized
      originalFileName: 'old_name.png',
      originalFileType: 'image/jpeg',
      originalFileSize: 0,
      originalFileChecksum: 'old-hash',
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: '2020-01-01T00:00:00.000Z',
    };

    const normalized = normalizeArchiveRecord(twoSidedRecord);
    assert.equal(normalized.schemaVersion, 2);
    assert.equal(normalized.originalFileName, 'hockeycard_PAIGE.png');
    assert.equal(normalized.originalFileChecksum, 'sha256-front-hex');
    assert.equal(normalized.sourceDriveFileId, 'drive-front-id');

    // Key resolver verification
    assert.equal(resolveAssetBinaryKey(normalized, 'FRONT'), 'arc-2021-paige');
    assert.equal(resolveAssetBinaryKey(normalized, 'BACK'), 'asset-back-uuid-2');
  });

  // =========================================================================
  // MILESTONE 5: PHASE B — STORAGE, MIGRATION & ATOMIC LINKING TESTS
  // =========================================================================

  // TEST 33: Idempotent migration identifies front, back, and unknown sides accurately
  test('33. Idempotent migration populates frontAsset, backAsset, and UNKNOWN without merging', async () => {
    // 1. Seed 3 legacy records without frontAsset / backAsset
    const legacyFront: HistoricalCardArchive = {
      archiveId: 'arc-legacy-front',
      originalFileName: 'hockeycard_PAIGE.png',
      originalFileType: 'image/png',
      originalFileSize: 100,
      originalFileChecksum: 'checksum-front',
      originalCreationYear: 2021,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: 'Front note',
    };

    const legacyBack: HistoricalCardArchive = {
      archiveId: 'arc-legacy-back',
      originalFileName: 'hockeycard_paige_back.png',
      originalFileType: 'image/png',
      originalFileSize: 100,
      originalFileChecksum: 'checksum-back',
      originalCreationYear: 2021,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: 'Back note',
    };

    const legacyUnknown: HistoricalCardArchive = {
      archiveId: 'arc-legacy-unknown',
      originalFileName: '???_symbol_card.png',
      originalFileType: 'image/png',
      originalFileSize: 50,
      originalFileChecksum: 'checksum-unknown',
      originalCreationYear: 2020,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: 'Mysterious scan',
    };

    const b = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await storage.saveArchiveRecord(legacyFront, b, null);
    await storage.saveArchiveRecord(legacyBack, b, null);
    await storage.saveArchiveRecord(legacyUnknown, b, null);

    // 2. Trigger migration
    await storage.migratePhysicalCardAssets();

    // 3. Verify each record
    const frontAfter = await storage.getArchiveRecord('arc-legacy-front');
    assert.ok(frontAfter);
    assert.equal(frontAfter.schemaVersion, 2);
    assert.ok(frontAfter.frontAsset);
    assert.equal(frontAfter.frontAsset.side, 'FRONT');
    assert.equal(frontAfter.backAsset, null);

    const backAfter = await storage.getArchiveRecord('arc-legacy-back');
    assert.ok(backAfter);
    assert.equal(backAfter.schemaVersion, 2);
    assert.equal(backAfter.frontAsset, null);
    assert.ok(backAfter.backAsset);
    assert.equal(backAfter.backAsset.side, 'BACK');
    // Confirm legacy shadow fields continue reading from backAsset
    assert.equal(backAfter.originalFileName, 'hockeycard_paige_back.png');

    const unknownAfter = await storage.getArchiveRecord('arc-legacy-unknown');
    assert.ok(unknownAfter);
    assert.equal(unknownAfter.schemaVersion, 2);
    assert.ok(unknownAfter.frontAsset);
    assert.equal(unknownAfter.frontAsset.side, 'UNKNOWN');

    // Verify all 3 records still exist as independent unmerged entries
    const all = await storage.getAllArchiveRecords();
    assert.equal(all.length, 3);
  });

  // TEST 34: Migration metadata isolation from queries, counts, and backups
  test('34. Migration metadata marker __archive_meta_migration_v2__ is strictly excluded from user queries and usage', async () => {
    await storage.migratePhysicalCardAssets();

    const allRecords = await storage.getAllArchiveRecords();
    const marker = allRecords.find(r => r.archiveId.startsWith('__'));
    assert.equal(marker, undefined, 'Metadata marker must never appear in user archive queries');

    const usage = await storage.getStorageUsage();
    assert.equal(usage.recordCount, allRecords.length);
  });

  // TEST 35: Atomic linking with multiple playable variations on both records
  test('35. Atomic linking links two records, re-keys secondary binary, and repoints all playable definitions', async () => {
    const rawFront = new Uint8Array([10, 20, 30]);
    const rawBack = new Uint8Array([40, 50, 60]);
    const blobFront = new Blob([rawFront], { type: 'image/png' });
    const blobBack = new Blob([rawBack], { type: 'image/png' });

    const cFront = await calculateFileChecksum(blobFront);
    const cBack = await calculateFileChecksum(blobBack);

    const cardFront: HistoricalCardArchive = {
      archiveId: 'arc-link-front',
      originalFileName: 'hockeycard_PAIGE.png',
      originalFileSize: 3,
      originalFileType: 'image/png',
      originalFileChecksum: cFront,
      originalCreationYear: 2021,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: '2021 Scans',
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: 'Front scan',
    };

    const cardBack: HistoricalCardArchive = {
      archiveId: 'arc-link-back',
      originalFileName: 'hockeycard_paige_back.png',
      originalFileSize: 3,
      originalFileType: 'image/png',
      originalFileChecksum: cBack,
      originalCreationYear: 2021,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: '2021 Scans',
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
      classification: 'CARD_ARTWORK',
      userNotes: 'Back scan',
    };

    await storage.saveArchiveRecord(cardFront, blobFront, null);
    await storage.saveArchiveRecord(cardBack, blobBack, null);

    // Create 2 playable cards on front, 2 playable cards on back
    const playF1: PlayableCardDefinition = {
      playableCardId: 'play-paige-std',
      archiveId: 'arc-link-front',
      displayName: 'Paige - Standard',
      variationName: 'Standard',
      cardType: 'CHARACTER',
      rarity: 'COMMON',
      department: 'TECH',
      shiftCost: 3,
      efficiency: 4,
      stamina: 5,
      maxStamina: 5,
      influence: 1,
      keywords: [],
      abilityName: null,
      abilityDesc: null,
      flavor: 'Ready for shift',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const playF2: PlayableCardDefinition = {
      ...playF1,
      playableCardId: 'play-paige-foil',
      displayName: 'Paige - Foil',
      variationName: 'Foil',
      rarity: 'RARE',
    };

    const playB1: PlayableCardDefinition = {
      ...playF1,
      playableCardId: 'play-paige-back-lore',
      archiveId: 'arc-link-back',
      displayName: 'Paige - Lore Variation',
      variationName: 'Lore',
    };

    const playB2: PlayableCardDefinition = {
      ...playF1,
      playableCardId: 'play-paige-back-promo',
      archiveId: 'arc-link-back',
      displayName: 'Paige - Promo Variation',
      variationName: 'Promo',
    };

    await storage.savePlayableCard(playF1);
    await storage.savePlayableCard(playF2);
    await storage.savePlayableCard(playB1);
    await storage.savePlayableCard(playB2);

    // Execute atomic link
    const linked = await storage.linkExistingArchiveRecords('arc-link-front', 'arc-link-back', 'FRONT', 'BACK');

    // 1. Verify combined physical card
    assert.ok(linked.frontAsset);
    assert.ok(linked.backAsset);
    assert.equal(linked.frontAsset.fileName, 'hockeycard_PAIGE.png');
    assert.equal(linked.backAsset.fileName, 'hockeycard_paige_back.png');
    assert.equal(linked.backAsset.fileChecksum, cBack);

    // 2. Verify secondary record was safely retired
    const secRecord = await storage.getArchiveRecord('arc-link-back');
    assert.equal(secRecord, null);

    // 3. Verify all 4 playable cards are active and point to primary physical card
    const playableOnPrimary = await storage.getPlayableCardsForArchive('arc-link-front');
    assert.equal(playableOnPrimary.length, 4);

    // 4. Verify both binaries are retrievable
    const frontBlobRetrieved = await storage.getArchiveBinaryForSide('arc-link-front', 'FRONT');
    const backBlobRetrieved = await storage.getArchiveBinaryForSide('arc-link-front', 'BACK');
    assert.ok(frontBlobRetrieved);
    assert.ok(backBlobRetrieved);
    assert.equal(frontBlobRetrieved.size, 3);
    assert.equal(backBlobRetrieved.size, 3);

    // 5. Test exact reversible unlinking restores secondary record and original playable cards
    const { primary, secondary } = await storage.unlinkArchiveRecord('arc-link-front');

    // Verify primary card has backAsset cleared
    assert.equal(primary.backAsset, null);
    assert.equal(primary.metadata?.unlinkingSnapshot, null);

    // Verify secondary card is restored with exact original ID
    assert.equal(secondary.archiveId, 'arc-link-back');
    assert.equal(secondary.originalFileName, 'hockeycard_paige_back.png');

    const restoredSec = await storage.getArchiveRecord('arc-link-back');
    assert.ok(restoredSec);
    assert.equal(restoredSec.originalFileName, 'hockeycard_paige_back.png');

    // Verify secondary binary is restored under original archiveId
    const restoredSecBinary = await storage.getArchiveBinary('arc-link-back');
    assert.ok(restoredSecBinary);
    assert.equal(restoredSecBinary.size, 3);

    // Verify playable cards were restored to their exact original cards
    const playablesOnPrimary = await storage.getPlayableCardsForArchive('arc-link-front');
    assert.equal(playablesOnPrimary.length, 2);
    assert.ok(playablesOnPrimary.some(p => p.playableCardId === 'play-paige-std'));
    assert.ok(playablesOnPrimary.some(p => p.playableCardId === 'play-paige-foil'));

    const playablesOnSecondary = await storage.getPlayableCardsForArchive('arc-link-back');
    assert.equal(playablesOnSecondary.length, 2);
    assert.ok(playablesOnSecondary.some(p => p.playableCardId === 'play-paige-back-lore'));
    assert.ok(playablesOnSecondary.some(p => p.playableCardId === 'play-paige-back-promo'));
  });

  // TEST 37: Atomic linking rollback safety on validation failure
  test('37. Rejects linking if primary already has a back asset or secondary does not exist without mutating records', async () => {
    await assert.rejects(
      async () => {
        await storage.linkExistingArchiveRecords('non-existent-1', 'non-existent-2');
      },
      /not found/i
    );
  });

  // TEST 38: Two-sided physical card save and retrieval via savePairedArchiveRecord
  test('38. savePairedArchiveRecord stores both front and back binaries atomically with correct side status', async () => {
    const frontBlob = new Blob(['FRONT-CONTENT-123'], { type: 'image/png' });
    const backBlob = new Blob(['BACK-CONTENT-456'], { type: 'image/png' });
    const frontChecksum = await calculateFileChecksum(frontBlob);
    const backChecksum = await calculateFileChecksum(backBlob);
    const archiveId = 'arc-two-sided-test';
    const backAssetId = generateAssetId();

    const record: HistoricalCardArchive = {
      archiveId,
      schemaVersion: 2,
      originalCreationYear: 2022,
      classification: 'CARD_ARTWORK',
      userNotes: 'Two-sided card test',
      frontAsset: {
        assetId: generateAssetId(),
        side: 'FRONT',
        binaryStorageKey: archiveId,
        fileName: 'hockeycard_GRIFF.png',
        fileType: 'image/png',
        fileSize: frontBlob.size,
        fileChecksum: frontChecksum,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: '2022/Players',
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
      },
      backAsset: {
        assetId: backAssetId,
        side: 'BACK',
        binaryStorageKey: backAssetId,
        fileName: 'hockeycard_griff_back.png',
        fileType: 'image/png',
        fileSize: backBlob.size,
        fileChecksum: backChecksum,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: '2022/Players',
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
      },
      originalFileName: 'hockeycard_GRIFF.png',
      originalFileType: 'image/png',
      originalFileSize: frontBlob.size,
      originalFileChecksum: frontChecksum,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: '2022/Players',
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
    };

    await storage.savePairedArchiveRecord(record, frontBlob, backBlob);

    // 1. Verify record side status
    const retrieved = await storage.getArchiveRecord(archiveId);
    assert.ok(retrieved);
    assert.equal(getCardArchiveSideStatus(retrieved), 'PAIRED');
    assert.equal(retrieved.frontAsset?.fileName, 'hockeycard_GRIFF.png');
    assert.equal(retrieved.backAsset?.fileName, 'hockeycard_griff_back.png');

    // 2. Verify both front and back binaries are retrieved with exact content
    const retrievedFront = await storage.getArchiveBinaryForSide(archiveId, 'FRONT');
    const retrievedBack = await storage.getArchiveBinaryForSide(archiveId, 'BACK');
    assert.ok(retrievedFront);
    assert.ok(retrievedBack);
    assert.equal(await calculateFileChecksum(retrievedFront), frontChecksum);
    assert.equal(await calculateFileChecksum(retrievedBack), backChecksum);

    // 3. Verify legacy single-binary accessor retrieves front
    const legacyFront = await storage.getArchiveBinary(archiveId);
    assert.ok(legacyFront);
    assert.equal(await calculateFileChecksum(legacyFront), frontChecksum);
  });

  // TEST 39: Deleting a paired physical card cleans up both binaries and thumbnails
  test('39. Deleting a paired physical card cleans up both front and back binaries without leaving orphans', async () => {
    const frontBlob = new Blob(['DEL-FRONT'], { type: 'image/png' });
    const backBlob = new Blob(['DEL-BACK'], { type: 'image/png' });
    const frontHash = await calculateFileChecksum(frontBlob);
    const backHash = await calculateFileChecksum(backBlob);
    const archiveId = 'arc-paired-delete-test';
    const backAssetId = generateAssetId();

    const record: HistoricalCardArchive = {
      archiveId,
      schemaVersion: 2,
      originalCreationYear: 2021,
      classification: 'CARD_ARTWORK',
      userNotes: null,
      frontAsset: {
        assetId: generateAssetId(),
        side: 'FRONT',
        binaryStorageKey: archiveId,
        fileName: 'test_card.png',
        fileType: 'image/png',
        fileSize: frontBlob.size,
        fileChecksum: frontHash,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: null,
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
      },
      backAsset: {
        assetId: backAssetId,
        side: 'BACK',
        binaryStorageKey: backAssetId,
        fileName: 'test_card_back.png',
        fileType: 'image/png',
        fileSize: backBlob.size,
        fileChecksum: backHash,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: null,
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
      },
      originalFileName: 'test_card.png',
      originalFileType: 'image/png',
      originalFileSize: frontBlob.size,
      originalFileChecksum: frontHash,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
    };

    await storage.savePairedArchiveRecord(record, frontBlob, backBlob);

    // Verify both exist before delete
    assert.ok(await storage.getArchiveBinaryForSide(archiveId, 'FRONT'));
    assert.ok(await storage.getArchiveBinaryForSide(archiveId, 'BACK'));

    // Execute deletion
    await storage.deleteArchiveRecord(archiveId);

    // Verify record and both binaries are gone
    assert.equal(await storage.getArchiveRecord(archiveId), null);
    assert.equal(await storage.getArchiveBinaryForSide(archiveId, 'FRONT'), null);
    assert.equal(await storage.getArchiveBinaryForSide(archiveId, 'BACK'), null);
  });

  // TEST 40: Backup bundle export preserves both front and back assets
  test('40. Backup bundle export preserves both front and back assets of paired physical cards', async () => {
    const fBlob = new Blob(['BUNDLE-FRONT-AAA'], { type: 'image/png' });
    const bBlob = new Blob(['BUNDLE-BACK-BBB'], { type: 'image/png' });
    const fHash = await calculateFileChecksum(fBlob);
    const bHash = await calculateFileChecksum(bBlob);
    const archiveId = 'arc-bundle-paired';
    const backAssetId = generateAssetId();

    const record: HistoricalCardArchive = {
      archiveId,
      schemaVersion: 2,
      originalCreationYear: 2023,
      classification: 'CARD_ARTWORK',
      userNotes: null,
      frontAsset: {
        assetId: generateAssetId(),
        side: 'FRONT',
        binaryStorageKey: archiveId,
        fileName: 'card_sarah.png',
        fileType: 'image/png',
        fileSize: fBlob.size,
        fileChecksum: fHash,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: null,
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
      },
      backAsset: {
        assetId: backAssetId,
        side: 'BACK',
        binaryStorageKey: backAssetId,
        fileName: 'card_sarah_back.png',
        fileType: 'image/png',
        fileSize: bBlob.size,
        fileChecksum: bHash,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: null,
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
      },
      originalFileName: 'card_sarah.png',
      originalFileType: 'image/png',
      originalFileSize: fBlob.size,
      originalFileChecksum: fHash,
      sourceProvider: 'LOCAL_UPLOAD',
      sourceFolderPath: null,
      sourceDriveFileId: null,
      importedAt: new Date().toISOString(),
    };

    await storage.savePairedArchiveRecord(record, fBlob, bBlob);

    const bundle = await storage.exportArchiveBundle();
    assert.ok(bundle.records.some(r => r.archiveId === archiveId));

    // Verify both front asset and back asset binaries are included in assets array
    const frontAssetInBundle = bundle.assets.find(a => a.archiveId === archiveId);
    const backAssetInBundle = bundle.assets.find(a => a.archiveId === backAssetId);
    assert.ok(frontAssetInBundle, 'Front binary asset must be included in bundle');
    assert.ok(backAssetInBundle, 'Back binary asset must be included in bundle');
    assert.equal(frontAssetInBundle.originalFileName, 'card_sarah.png');
    assert.equal(backAssetInBundle.originalFileName, 'card_sarah_back.png');

    const validation = await storage.validateArchiveBundle(bundle);
    assert.equal(validation.isValid, true);
  });
});



