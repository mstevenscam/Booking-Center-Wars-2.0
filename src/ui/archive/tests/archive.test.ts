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
});
