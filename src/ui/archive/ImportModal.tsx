/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * 5-Step Physical Card Import Modal (Milestone 5 — Front/Back Recognition & Pairing)
 * 
 * Features:
 * - STEP 1: Choose Source (Google Drive or Local Upload).
 * - Support for Local Folder selection (webkitdirectory) and multi-file selection.
 * - Deep recursive drag-and-drop directory traversal preserving relative folder paths.
 * - STEP 3: Physical Card Batch Review with Front/Back Pair Recognition:
 *     * Automatic pairing of front & back scans (e.g. hockeycard_PAIGE.png + hockeycard_paige_back.png).
 *     * Side-by-side previews of Front & Back scans with resolution, checksum & provenance.
 *     * Interactive Swap Sides action.
 *     * Interactive Unpair action (splits into two standalone cards).
 *     * Manual Pairing action (links unassigned front and back scans).
 *     * Side classification selector for single scans (FRONT, BACK, UNKNOWN).
 * - STEP 4: Real-time atomic import execution into IndexedDB using savePairedArchiveRecord / saveArchiveRecord.
 * - STEP 5: Complete summary showing physical cards created, scans preserved, and actionable feedback.
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Upload, 
  HardDrive, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  Sparkles, 
  ArrowRight, 
  ArrowLeft,
  RefreshCw,
  Folder,
  Layers,
  FileText,
  FileCode,
  ShieldCheck,
  AlertCircle,
  FolderTree,
  ArrowLeftRight,
  Scissors,
  Link2,
  Check,
  HelpCircle
} from 'lucide-react';
import { 
  ImportBatchItem, 
  ArchiveClassification, 
  ArchiveSourceProvider, 
  StorageStatus,
  ArchiveAssetProvenance,
  HistoricalCardArchive,
  CardAssetSide
} from './types';
import { 
  calculateFileChecksum, 
  classifyFile, 
  extractYearFromFilename, 
  generateStableArchiveId, 
  generateThumbnail, 
  formatFileSize 
} from './utils';
import { pairCardBatch, analyzeCardFilename, CandidatePair } from './cardPairing';
import { generateAssetId, normalizeArchiveRecord } from './cardAccessors';
import { archiveStorage } from './storage';
import { googleDriveService } from './googleDriveService';
import { aiMetadataService } from './aiMetadataService';
import { GoogleDriveSetupModal } from './GoogleDriveSetupModal';

export interface StagedPhysicalCard {
  id: string;
  baseId: string;
  frontItem: ImportBatchItem | null;
  backItem: ImportBatchItem | null;
  pairingStatus: 'CONFIRMED' | 'FRONT_ONLY' | 'BACK_ONLY' | 'AMBIGUOUS' | 'UNKNOWN_SIDE';
  ambiguityReason?: string;
  creationYear: number | null;
  classification: ArchiveClassification;
  isDuplicate: boolean;
  duplicateReason?: string;
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  onCreatePlayableFromId?: (archiveId: string) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  onCreatePlayableFromId
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [sourceProvider, setSourceProvider] = useState<ArchiveSourceProvider>('LOCAL_UPLOAD');
  const [stagedCards, setStagedCards] = useState<StagedPhysicalCard[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [completedItems, setCompletedItems] = useState<{ id: string; name: string; archiveId: string; isPaired: boolean }[]>([]);
  const [failedItems, setFailedItems] = useState<{ id: string; name: string; error: string }[]>([]);
  const [driveSetupOpen, setDriveSetupOpen] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveError, setDriveError] = useState<{ title: string; message: string; type: 'AUTH' | 'PERMISSION' | 'DOWNLOAD' | 'CONFIG' | 'MALFORMED' | 'GENERAL' } | null>(null);
  const [driveProgress, setDriveProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [driveNotice, setDriveNotice] = useState<string | null>(null);
  const [aiAnalyzingId, setAiAnalyzingId] = useState<string | null>(null);
  const [pairingTargetId, setPairingTargetId] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({
    isPersistent: true,
    storageEngine: 'INDEXED_DB',
    error: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const driveStatus = googleDriveService.getConfigStatus();

  // Inspect storage health on mount & open
  useEffect(() => {
    if (isOpen) {
      archiveStorage.init().then(() => {
        setStorageStatus(archiveStorage.getStorageStatus());
      });
    }
  }, [isOpen]);

  // Configure folder directory inputs
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, [step]);

  if (!isOpen) return null;

  // Cleanup object URLs helper
  const cleanupStagedUrls = (cards: StagedPhysicalCard[]) => {
    for (const c of cards) {
      if (c.frontItem?.previewUrl) URL.revokeObjectURL(c.frontItem.previewUrl);
      if (c.backItem?.previewUrl) URL.revokeObjectURL(c.backItem.previewUrl);
    }
  };

  // Reset modal state
  const handleReset = () => {
    cleanupStagedUrls(stagedCards);
    setStep(1);
    setStagedCards([]);
    setIsProcessingFiles(false);
    setIsImporting(false);
    setImportProgress(0);
    setCompletedItems([]);
    setFailedItems([]);
    setPairingTargetId(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  /**
   * Processes incoming files, computes hashes & classifications, and deterministically
   * groups recognized front/back pairs into StagedPhysicalCards.
   */
  const processFilesWithPaths = async (
    files: { file: File | Blob; relativePath?: string; folderPath?: string }[],
    provider: ArchiveSourceProvider = 'LOCAL_UPLOAD'
  ) => {
    setIsProcessingFiles(true);
    const newRawItems: ImportBatchItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      const file = item.file;
      const fileName = file instanceof File ? file.name : `scan-${Date.now()}-${i}.png`;
      const fileType = file.type || 'application/octet-stream';
      const fileSize = file.size;

      let folderPath = item.folderPath;
      if (!folderPath && item.relativePath) {
        const lastSlash = item.relativePath.lastIndexOf('/');
        folderPath = lastSlash !== -1 ? item.relativePath.substring(0, lastSlash) : undefined;
      }

      const checksum = await calculateFileChecksum(file);
      const classification = classifyFile(fileName, fileType);
      const creationYear = extractYearFromFilename(fileName, folderPath);
      const dupCheck = await archiveStorage.checkDuplicate(checksum, null);

      let previewUrl: string | null = null;
      if (classification === 'CARD_ARTWORK') {
        previewUrl = URL.createObjectURL(file);
      }

      newRawItems.push({
        id: `batch-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        name: fileName,
        type: fileType,
        size: fileSize,
        checksum,
        creationYear,
        sourceFolderPath: folderPath || null,
        sourceDriveFileId: null,
        sourceProvider: provider,
        classification,
        previewUrl,
        isDuplicate: dupCheck.isDuplicate,
        duplicateReason: dupCheck.reason,
        matchedArchiveId: dupCheck.matchedRecord?.archiveId,
        status: 'PENDING',
      });
    }

    // Run deterministic pairing engine
    const pairs = pairCardBatch(newRawItems);
    const newStaged: StagedPhysicalCard[] = [];

    for (let idx = 0; idx < pairs.length; idx++) {
      const p = pairs[idx];
      const id = `staged-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;

      if (p.status === 'CONFIRMED') {
        newStaged.push({
          id,
          baseId: p.cardBaseId,
          frontItem: p.front,
          backItem: p.back,
          pairingStatus: 'CONFIRMED',
          creationYear: p.front?.creationYear ?? p.back?.creationYear ?? null,
          classification: p.front?.classification || 'CARD_ARTWORK',
          isDuplicate: Boolean(p.front?.isDuplicate || p.back?.isDuplicate),
          duplicateReason: p.front?.duplicateReason || p.back?.duplicateReason,
        });
      } else if (p.status === 'FRONT_ONLY') {
        newStaged.push({
          id,
          baseId: p.cardBaseId,
          frontItem: p.front,
          backItem: null,
          pairingStatus: 'FRONT_ONLY',
          creationYear: p.front?.creationYear ?? null,
          classification: p.front?.classification || 'CARD_ARTWORK',
          isDuplicate: Boolean(p.front?.isDuplicate),
          duplicateReason: p.front?.duplicateReason,
        });
      } else if (p.status === 'BACK_ONLY') {
        newStaged.push({
          id,
          baseId: p.cardBaseId,
          frontItem: null,
          backItem: p.back,
          pairingStatus: 'BACK_ONLY',
          creationYear: p.back?.creationYear ?? null,
          classification: p.back?.classification || 'CARD_ARTWORK',
          isDuplicate: Boolean(p.back?.isDuplicate),
          duplicateReason: p.back?.duplicateReason,
        });
      } else if (p.status === 'AMBIGUOUS') {
        newStaged.push({
          id,
          baseId: p.cardBaseId,
          frontItem: p.front,
          backItem: p.back,
          pairingStatus: 'AMBIGUOUS',
          ambiguityReason: p.reason,
          creationYear: p.front?.creationYear ?? p.back?.creationYear ?? null,
          classification: p.front?.classification || 'CARD_ARTWORK',
          isDuplicate: Boolean(p.front?.isDuplicate || p.back?.isDuplicate),
          duplicateReason: p.front?.duplicateReason || p.back?.duplicateReason,
        });
      } else {
        // UNKNOWN_SIDE
        for (let cIdx = 0; cIdx < p.candidates.length; cIdx++) {
          const cand = p.candidates[cIdx];
          newStaged.push({
            id: `${id}-cand-${cIdx}`,
            baseId: p.cardBaseId,
            frontItem: cand,
            backItem: null,
            pairingStatus: 'UNKNOWN_SIDE',
            ambiguityReason: p.reason || 'Uncertain side convention',
            creationYear: cand.creationYear,
            classification: cand.classification,
            isDuplicate: Boolean(cand.isDuplicate),
            duplicateReason: cand.duplicateReason,
          });
        }
      }
    }

    setStagedCards(prev => [...prev, ...newStaged]);
    setIsProcessingFiles(false);
    setStep(3); // Advance to Review Batch
  };

  // Handle standard file selection
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileList = Array.from(e.target.files).map(f => ({
      file: f,
      relativePath: (f as any).webkitRelativePath || f.name,
    }));
    processFilesWithPaths(fileList, 'LOCAL_UPLOAD');
  };

  // Handle folder selection
  const handleFolderSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileList = Array.from(e.target.files).map(f => ({
      file: f,
      relativePath: (f as any).webkitRelativePath || f.name,
    }));
    processFilesWithPaths(fileList, 'LOCAL_UPLOAD');
  };

  // Drag and drop recursive directory reader
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setSourceProvider('LOCAL_UPLOAD');
    setIsProcessingFiles(true);

    const items = e.dataTransfer.items;
    const extracted: { file: File; relativePath: string }[] = [];

    if (items && items.length > 0) {
      const readDir = (entry: any, path: string): Promise<void> => {
        return new Promise((resolve) => {
          const reader = entry.createReader();
          const readBatch = () => {
            reader.readEntries(async (entries: any[]) => {
              if (!entries || entries.length === 0) {
                resolve();
              } else {
                for (const child of entries) {
                  const childPath = path ? `${path}/${child.name}` : child.name;
                  if (child.isFile) {
                    await new Promise<void>((resFile) => {
                      child.file((f: File) => {
                        extracted.push({ file: f, relativePath: childPath });
                        resFile();
                      });
                    });
                  } else if (child.isDirectory) {
                    await readDir(child, childPath);
                  }
                }
                readBatch();
              }
            });
          };
          readBatch();
        });
      };

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;
        if (entry) {
          if (entry.isFile) {
            await new Promise<void>((resFile) => {
              entry.file((f: File) => {
                extracted.push({ file: f, relativePath: f.name });
                resFile();
              });
            });
          } else if (entry.isDirectory) {
            await readDir(entry, entry.name);
          }
        } else {
          const file = item.getAsFile();
          if (file) {
            extracted.push({ file, relativePath: file.name });
          }
        }
      }
    } else if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i];
        extracted.push({ file: f, relativePath: (f as any).webkitRelativePath || f.name });
      }
    }

    if (extracted.length > 0) {
      await processFilesWithPaths(extracted, 'LOCAL_UPLOAD');
    } else {
      setIsProcessingFiles(false);
    }
  };

  // Google Drive connect & pick
  const handleConnectGoogleDrive = async () => {
    setDriveError(null);
    setDriveNotice(null);

    if (!driveStatus.isConfigured) {
      setDriveSetupOpen(true);
      return;
    }

    setDriveConnecting(true);
    setDriveProgress(null);

    try {
      const pickedFiles = await googleDriveService.openPicker();

      // Clean cancellation by user
      if (pickedFiles.length === 0) {
        setDriveNotice('Selection canceled. No files were chosen from Google Drive.');
        setDriveConnecting(false);
        return;
      }

      setIsProcessingFiles(true);
      const downloadedFiles: { file: Blob; relativePath?: string; folderPath?: string }[] = [];
      const downloadFailures: { name: string; error: string }[] = [];

      for (let i = 0; i < pickedFiles.length; i++) {
        const driveItem = pickedFiles[i];
        setDriveProgress({
          current: i + 1,
          total: pickedFiles.length,
          filename: driveItem.name,
        });

        try {
          const blob = await googleDriveService.downloadFileBinary(driveItem.id);
          // Set fileName on blob for consistency
          (blob as any).name = driveItem.name;
          downloadedFiles.push({
            file: blob,
            folderPath: driveItem.folderPath,
          });
        } catch (itemErr: any) {
          downloadFailures.push({
            name: driveItem.name,
            error: itemErr.message || 'Download failed',
          });
        }
      }

      if (downloadedFiles.length > 0) {
        setSourceProvider('GOOGLE_DRIVE');
        setDriveProgress(null);
        await processFilesWithPaths(downloadedFiles, 'GOOGLE_DRIVE');

        if (downloadFailures.length > 0) {
          setDriveError({
            title: 'Partial Download Failure',
            message: `${downloadFailures.length} of ${pickedFiles.length} file(s) failed to download: ${downloadFailures.map(f => `${f.name} (${f.error})`).join(', ')}.`,
            type: 'DOWNLOAD',
          });
        }
      } else {
        setDriveProgress(null);
        setIsProcessingFiles(false);
        setDriveError({
          title: 'Google Drive Download Failed',
          message: `None of the selected files could be downloaded. Details: ${downloadFailures.map(f => `${f.name}: ${f.error}`).join('; ')}`,
          type: 'DOWNLOAD',
        });
      }
    } catch (err: any) {
      setDriveProgress(null);
      setIsProcessingFiles(false);
      const msg = err?.message || String(err);

      if (msg.includes('OAuth Error') || msg.includes('access_denied') || msg.includes('Authentication expired') || msg.includes('HTTP 401')) {
        setDriveError({
          title: 'Google Authentication Error',
          message: msg,
          type: 'AUTH',
        });
      } else if (msg.includes('Permission denied') || msg.includes('HTTP 403') || msg.includes('read access')) {
        setDriveError({
          title: 'Google Drive Permission Error',
          message: msg,
          type: 'PERMISSION',
        });
      } else if (msg.includes('configuration incomplete') || msg.includes('Missing:')) {
        setDriveError({
          title: 'Configuration Incomplete',
          message: msg,
          type: 'CONFIG',
        });
      } else if (msg.includes('malformed') || msg.includes('missing a valid File ID')) {
        setDriveError({
          title: 'Malformed Google Picker Data',
          message: msg,
          type: 'MALFORMED',
        });
      } else {
        setDriveError({
          title: 'Google Drive Connection Error',
          message: msg,
          type: 'GENERAL',
        });
      }
    } finally {
      setDriveConnecting(false);
    }
  };

  // -------------------------------------------------------------
  // STAGED CARD INTERACTIVE ACTIONS
  // -------------------------------------------------------------

  // Swap front & back scans
  const handleSwapSides = (cardId: string) => {
    setStagedCards(prev => prev.map(c => {
      if (c.id === cardId) {
        return {
          ...c,
          frontItem: c.backItem,
          backItem: c.frontItem,
          pairingStatus: c.frontItem && c.backItem ? 'CONFIRMED' : (c.backItem ? 'FRONT_ONLY' : 'BACK_ONLY'),
        };
      }
      return c;
    }));
  };

  // Unpair a 2-sided card into two separate standalone cards
  const handleUnpair = (cardId: string) => {
    setStagedCards(prev => {
      const target = prev.find(c => c.id === cardId);
      if (!target || !target.frontItem || !target.backItem) return prev;

      const frontCard: StagedPhysicalCard = {
        ...target,
        id: `staged-${Date.now()}-f-${Math.random().toString(36).substring(2, 6)}`,
        backItem: null,
        pairingStatus: 'FRONT_ONLY',
        ambiguityReason: undefined,
      };

      const backCard: StagedPhysicalCard = {
        ...target,
        id: `staged-${Date.now()}-b-${Math.random().toString(36).substring(2, 6)}`,
        frontItem: null,
        backItem: target.backItem,
        pairingStatus: 'BACK_ONLY',
        ambiguityReason: undefined,
      };

      return prev.flatMap(c => c.id === cardId ? [frontCard, backCard] : [c]);
    });
  };

  // Manually link a secondary scan as back of target card
  const handleManualPair = (targetCardId: string, candidateCardId: string) => {
    setStagedCards(prev => {
      const target = prev.find(c => c.id === targetCardId);
      const candidate = prev.find(c => c.id === candidateCardId);
      if (!target || !candidate) return prev;

      const front = target.frontItem || candidate.frontItem;
      const back = target.backItem || candidate.backItem || (candidate.frontItem !== front ? candidate.frontItem : null);

      const merged: StagedPhysicalCard = {
        ...target,
        frontItem: front,
        backItem: back,
        pairingStatus: front && back ? 'CONFIRMED' : 'FRONT_ONLY',
        ambiguityReason: undefined,
        isDuplicate: Boolean((front && front.isDuplicate) || (back && back.isDuplicate)),
      };

      return prev.filter(c => c.id !== candidateCardId).map(c => c.id === targetCardId ? merged : c);
    });
    setPairingTargetId(null);
  };

  // Change side assignment for single-sided card
  const handleSetSingleSide = (cardId: string, newSide: CardAssetSide) => {
    setStagedCards(prev => prev.map(c => {
      if (c.id === cardId) {
        const item = c.frontItem || c.backItem;
        if (!item) return c;

        if (newSide === 'FRONT') {
          return {
            ...c,
            frontItem: item,
            backItem: null,
            pairingStatus: 'FRONT_ONLY',
          };
        } else if (newSide === 'BACK') {
          return {
            ...c,
            frontItem: null,
            backItem: item,
            pairingStatus: 'BACK_ONLY',
          };
        } else {
          return {
            ...c,
            frontItem: item,
            backItem: null,
            pairingStatus: 'UNKNOWN_SIDE',
          };
        }
      }
      return c;
    }));
  };

  // Remove card from batch
  const handleRemoveCard = (cardId: string) => {
    setStagedCards(prev => {
      const target = prev.find(c => c.id === cardId);
      if (target?.frontItem?.previewUrl) URL.revokeObjectURL(target.frontItem.previewUrl);
      if (target?.backItem?.previewUrl) URL.revokeObjectURL(target.backItem.previewUrl);
      return prev.filter(c => c.id !== cardId);
    });
  };

  // Update classification
  const handleUpdateClassification = (cardId: string, classification: ArchiveClassification) => {
    setStagedCards(prev => prev.map(c => c.id === cardId ? { ...c, classification } : c));
  };

  // Update creation year
  const handleUpdateYear = (cardId: string, yearStr: string) => {
    const year = parseInt(yearStr, 10);
    setStagedCards(prev => prev.map(c => c.id === cardId ? {
      ...c,
      creationYear: !isNaN(year) && year >= 1950 && year <= 2050 ? year : null,
    } : c));
  };

  // Optional AI scan helper
  const handleRunAiAnalysis = async (card: StagedPhysicalCard) => {
    const item = card.frontItem || card.backItem;
    if (!item || card.classification !== 'CARD_ARTWORK') return;
    setAiAnalyzingId(card.id);

    try {
      const suggestion = await aiMetadataService.analyzeCardScan(item.file, item.name);
      if (suggestion) {
        setStagedCards(prev => prev.map(c => {
          if (c.id === card.id) {
            return {
              ...c,
              creationYear: suggestion.detectedYear ?? c.creationYear,
            };
          }
          return c;
        }));
      }
    } finally {
      setAiAnalyzingId(null);
    }
  };

  // -------------------------------------------------------------
  // COMMIT / EXECUTE IMPORT
  // -------------------------------------------------------------
  const handleExecuteImport = async () => {
    if (!storageStatus.isPersistent) {
      alert(
        `Cannot execute permanent archive import:\n${storageStatus.error || 'Persistent browser storage (IndexedDB) is blocked or unavailable in this session.'}`
      );
      return;
    }

    setIsImporting(true);
    setStep(4);
    setImportProgress(0);

    const successful: { id: string; name: string; archiveId: string; isPaired: boolean }[] = [];
    const failed: { id: string; name: string; error: string }[] = [];
    const validCards = stagedCards.filter(c => !c.isDuplicate);

    for (let i = 0; i < validCards.length; i++) {
      const card = validCards[i];
      try {
        if (card.frontItem && card.backItem) {
          // ==========================================
          // CASE 1: PAIRED 2-SIDED PHYSICAL CARD
          // ==========================================
          const archiveId = generateStableArchiveId(card.frontItem.checksum, card.frontItem.name, card.creationYear);
          const frontThumb = card.classification === 'CARD_ARTWORK' ? await generateThumbnail(card.frontItem.file) : null;
          const backThumb = card.classification === 'CARD_ARTWORK' ? await generateThumbnail(card.backItem.file) : null;
          const backAssetId = generateAssetId();

          const frontAsset: ArchiveAssetProvenance = {
            assetId: generateAssetId(),
            side: 'FRONT',
            binaryStorageKey: archiveId,
            fileName: card.frontItem.name,
            fileType: card.frontItem.type,
            fileSize: card.frontItem.size,
            fileChecksum: card.frontItem.checksum,
            sourceProvider: card.frontItem.sourceProvider,
            sourceFolderPath: card.frontItem.sourceFolderPath,
            sourceDriveFileId: card.frontItem.sourceDriveFileId,
            importedAt: new Date().toISOString(),
          };

          const backAsset: ArchiveAssetProvenance = {
            assetId: backAssetId,
            side: 'BACK',
            binaryStorageKey: backAssetId,
            fileName: card.backItem.name,
            fileType: card.backItem.type,
            fileSize: card.backItem.size,
            fileChecksum: card.backItem.checksum,
            sourceProvider: card.backItem.sourceProvider,
            sourceFolderPath: card.backItem.sourceFolderPath,
            sourceDriveFileId: card.backItem.sourceDriveFileId,
            importedAt: new Date().toISOString(),
          };

          const record: HistoricalCardArchive = {
            archiveId,
            schemaVersion: 2,
            frontAsset,
            backAsset,
            originalCreationYear: card.creationYear,
            classification: card.classification,
            userNotes: null,
            derivedThumbnailId: frontThumb ? `thumb-${archiveId}` : null,
            originalFileName: card.frontItem.name,
            originalFileType: card.frontItem.type,
            originalFileSize: card.frontItem.size,
            originalFileChecksum: card.frontItem.checksum,
            sourceProvider: card.frontItem.sourceProvider,
            sourceFolderPath: card.frontItem.sourceFolderPath,
            sourceDriveFileId: card.frontItem.sourceDriveFileId,
            importedAt: new Date().toISOString(),
          };

          await archiveStorage.savePairedArchiveRecord(
            record,
            card.frontItem.file,
            card.backItem.file,
            frontThumb,
            backThumb
          );

          successful.push({
            id: card.id,
            name: `${card.frontItem.name} + ${card.backItem.name}`,
            archiveId,
            isPaired: true,
          });
        } else if (card.frontItem) {
          // ==========================================
          // CASE 2: FRONT SCAN ONLY (OR UNKNOWN)
          // ==========================================
          const archiveId = generateStableArchiveId(card.frontItem.checksum, card.frontItem.name, card.creationYear);
          const frontThumb = card.classification === 'CARD_ARTWORK' ? await generateThumbnail(card.frontItem.file) : null;
          const side: CardAssetSide = card.pairingStatus === 'UNKNOWN_SIDE' ? 'UNKNOWN' : 'FRONT';

          const frontAsset: ArchiveAssetProvenance = {
            assetId: generateAssetId(),
            side,
            binaryStorageKey: archiveId,
            fileName: card.frontItem.name,
            fileType: card.frontItem.type,
            fileSize: card.frontItem.size,
            fileChecksum: card.frontItem.checksum,
            sourceProvider: card.frontItem.sourceProvider,
            sourceFolderPath: card.frontItem.sourceFolderPath,
            sourceDriveFileId: card.frontItem.sourceDriveFileId,
            importedAt: new Date().toISOString(),
          };

          const record: HistoricalCardArchive = {
            archiveId,
            schemaVersion: 2,
            frontAsset,
            backAsset: null,
            originalCreationYear: card.creationYear,
            classification: card.classification,
            userNotes: null,
            derivedThumbnailId: frontThumb ? `thumb-${archiveId}` : null,
            originalFileName: card.frontItem.name,
            originalFileType: card.frontItem.type,
            originalFileSize: card.frontItem.size,
            originalFileChecksum: card.frontItem.checksum,
            sourceProvider: card.frontItem.sourceProvider,
            sourceFolderPath: card.frontItem.sourceFolderPath,
            sourceDriveFileId: card.frontItem.sourceDriveFileId,
            importedAt: new Date().toISOString(),
          };

          await archiveStorage.saveArchiveRecord(record, card.frontItem.file, frontThumb);

          successful.push({
            id: card.id,
            name: card.frontItem.name,
            archiveId,
            isPaired: false,
          });
        } else if (card.backItem) {
          // ==========================================
          // CASE 3: BACK SCAN ONLY
          // ==========================================
          const archiveId = generateStableArchiveId(card.backItem.checksum, card.backItem.name, card.creationYear);
          const backThumb = card.classification === 'CARD_ARTWORK' ? await generateThumbnail(card.backItem.file) : null;
          const side: CardAssetSide = card.pairingStatus === 'UNKNOWN_SIDE' ? 'UNKNOWN' : 'BACK';

          const backAsset: ArchiveAssetProvenance = {
            assetId: generateAssetId(),
            side,
            binaryStorageKey: archiveId,
            fileName: card.backItem.name,
            fileType: card.backItem.type,
            fileSize: card.backItem.size,
            fileChecksum: card.backItem.checksum,
            sourceProvider: card.backItem.sourceProvider,
            sourceFolderPath: card.backItem.sourceFolderPath,
            sourceDriveFileId: card.backItem.sourceDriveFileId,
            importedAt: new Date().toISOString(),
          };

          const record: HistoricalCardArchive = {
            archiveId,
            schemaVersion: 2,
            frontAsset: null,
            backAsset,
            originalCreationYear: card.creationYear,
            classification: card.classification,
            userNotes: null,
            derivedThumbnailId: backThumb ? `thumb-${archiveId}` : null,
            originalFileName: card.backItem.name,
            originalFileType: card.backItem.type,
            originalFileSize: card.backItem.size,
            originalFileChecksum: card.backItem.checksum,
            sourceProvider: card.backItem.sourceProvider,
            sourceFolderPath: card.backItem.sourceFolderPath,
            sourceDriveFileId: card.backItem.sourceDriveFileId,
            importedAt: new Date().toISOString(),
          };

          await archiveStorage.saveArchiveRecord(record, card.backItem.file, backThumb);

          successful.push({
            id: card.id,
            name: card.backItem.name,
            archiveId,
            isPaired: false,
          });
        }
      } catch (err: any) {
        console.error(`Failed to import staged card:`, err);
        failed.push({
          id: card.id,
          name: card.frontItem?.name || card.backItem?.name || 'Unknown item',
          error: err?.message || 'Storage write failed',
        });
      }

      setImportProgress(Math.round(((i + 1) / validCards.length) * 100));
    }

    setCompletedItems(successful);
    setFailedItems(failed);
    setIsImporting(false);
    setStep(5);
    onImportComplete();
  };

  // Helper counting total files in batch
  const totalScansInBatch = stagedCards.reduce((acc, c) => {
    return acc + (c.frontItem ? 1 : 0) + (c.backItem ? 1 : 0);
  }, 0);

  const unpairedCandidates = stagedCards.filter(c => (c.frontItem && !c.backItem) || (!c.frontItem && c.backItem));

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
        <div className="absolute inset-0" onClick={handleClose} />

        <div className="relative z-10 w-full max-w-4xl bg-slate-900 border-2 border-slate-700/80 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header & Step Indicator */}
          <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  STEP {step} OF 5
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {step === 1 && 'Select Import Source'}
                  {step === 3 && 'Review Front/Back Pairings & Metadata'}
                  {step === 4 && 'Saving to Archive...'}
                  {step === 5 && 'Import Summary'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-100 mt-1">
                {step === 1 && 'Card Archive & Import Centre'}
                {step === 3 && `Review Batch (${stagedCards.length} Cards · ${totalScansInBatch} Scans)`}
                {step === 4 && 'Archiving Physical Cards...'}
                {step === 5 && 'Archive Import Finished'}
              </h2>
            </div>
            <button
              onClick={handleClose}
              disabled={isImporting}
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Fail-Safe Storage Warning Banner */}
          {!storageStatus.isPersistent && (
            <div className="bg-rose-950/80 border-b border-rose-500/40 px-6 py-3 flex items-center gap-3 text-rose-200 text-xs">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <strong>Persistent Browser Storage Unavailable:</strong> {storageStatus.error || 'IndexedDB is blocked or disabled in this browser session.'} Permanent card archiving is disabled to prevent accidental data loss.
              </div>
            </div>
          )}

          {/* STEP 1: CHOOSE SOURCE */}
          {step === 1 && (
            <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
              {/* Drive Error Banner */}
              {driveError && (
                <div className="p-4 rounded-2xl bg-rose-950/40 border-2 border-rose-500/50 text-rose-200 flex items-start gap-3 animate-in fade-in">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-rose-300 flex items-center justify-between">
                      <span>{driveError.title}</span>
                      <button
                        onClick={() => setDriveError(null)}
                        className="text-rose-400 hover:text-white p-1 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-rose-200/90 mt-1 leading-relaxed break-words">
                      {driveError.message}
                    </p>
                    {driveError.type === 'PERMISSION' && (
                      <div className="mt-2 text-[11px] text-rose-300/80 bg-rose-950/60 p-2 rounded-lg border border-rose-800/40">
                        <strong>Note on drive.file scope:</strong> Only files selected directly via the Google Picker window can be read. If your Google Cloud project credentials or OAuth consent configuration have changed, ensure the user account is added as a Test User.
                      </div>
                    )}
                    {driveError.type === 'CONFIG' && (
                      <button
                        onClick={() => setDriveSetupOpen(true)}
                        className="mt-2 px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-100 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                      >
                        Open Setup Guide
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Progress Indicator while downloading Drive files */}
              {driveProgress && (
                <div className="p-4 rounded-2xl bg-sky-950/40 border-2 border-sky-500/50 text-sky-200 flex items-center gap-3 animate-in fade-in">
                  <RefreshCw className="w-5 h-5 text-sky-400 animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs text-sky-300 flex items-center justify-between">
                      <span>Downloading Google Drive Files...</span>
                      <span className="font-mono text-sky-400">
                        {driveProgress.current} / {driveProgress.total}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 truncate mt-0.5 font-mono">
                      {driveProgress.filename}
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 mt-2 overflow-hidden border border-slate-800">
                      <div
                        className="bg-sky-400 h-full transition-all duration-300"
                        style={{ width: `${(driveProgress.current / driveProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Drive Cancellation / Soft Notice */}
              {driveNotice && (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs flex items-center justify-between animate-in fade-in">
                  <span>{driveNotice}</span>
                  <button onClick={() => setDriveNotice(null)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                Import physical card scans (JPG, PNG, WEBP, TIFF) and original Photoshop templates (PSD). 
                Front and back scans (such as <code>hockeycard_PAIGE.png</code> and <code>hockeycard_paige_back.png</code>) 
                are automatically recognized and paired into single two-sided physical cards.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Method A: Local Computer */}
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="p-6 rounded-2xl bg-slate-950/70 border-2 border-slate-800 hover:border-amber-400 hover:bg-slate-950 transition-all flex flex-col justify-between min-h-[260px]"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      <Upload className="w-7 h-7" />
                    </div>
                    <span className="text-[10px] uppercase font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-950/40 border border-amber-500/30">
                      Folder & Files
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-black text-slate-100">
                      Import From Computer
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Select entire year-organized folders or individual front/back scans. Relative subfolder paths are preserved automatically.
                    </p>
                    <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                      <span>Supports: JPG · PNG · WEBP · TIFF · PSD</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition-colors shadow-md"
                    >
                      <FolderTree className="w-4 h-4" />
                      <span>Select Folder</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Select Files</span>
                    </button>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.psd"
                    onChange={handleFilesSelected}
                    className="hidden"
                  />
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    onChange={handleFolderSelected}
                    className="hidden"
                  />
                </div>

                {/* Method B: Google Drive */}
                <div 
                  onClick={handleConnectGoogleDrive}
                  className="p-6 rounded-2xl bg-slate-950/70 border-2 border-slate-800 hover:border-sky-400 hover:bg-slate-950 transition-all cursor-pointer group flex flex-col justify-between min-h-[260px]"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30 group-hover:scale-110 transition-transform">
                      <HardDrive className="w-7 h-7" />
                    </div>
                    <div className="flex items-center gap-1">
                      {driveStatus.isConfigured ? (
                        <span className="text-[10px] uppercase font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Ready
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDriveSetupOpen(true);
                          }}
                          className="text-[10px] uppercase font-bold text-amber-400 hover:text-amber-300 px-2 py-0.5 rounded bg-amber-950/50 border border-amber-500/40 hover:underline"
                        >
                          Setup Guide
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-black text-slate-100 group-hover:text-sky-300 transition-colors flex items-center gap-2">
                      <span>Connect Google Drive</span>
                      {driveConnecting && <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Connect your Google Drive card repository. Front and back scans are automatically grouped during review.
                    </p>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                      <span>Least-Privilege Scopes · File-Level Access</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-400">OAuth Web Client</span>
                    <span className="text-sky-400 font-bold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                      Open Picker &rarr;
                    </span>
                  </div>
                </div>
              </div>

              {/* Safety notice */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3 text-xs text-slate-400">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <p>
                  <strong>Physical Preservation Contract:</strong> Original scans and Photoshop templates are cryptographically verified and stored unaltered in your browser’s IndexedDB database.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW BATCH (FRONT/BACK RECOGNITION & PAIRING) */}
          {step === 3 && (
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800 gap-2">
                <span>
                  Physical card scans have been grouped by filename identity. Review pairings, swap sides, or split cards if necessary.
                </span>
                <span className="font-mono text-amber-400 font-bold shrink-0">
                  {stagedCards.length} Cards ({totalScansInBatch} Scans)
                </span>
              </div>

              {/* Items List */}
              <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1">
                {stagedCards.map((card) => {
                  const hasFront = Boolean(card.frontItem);
                  const hasBack = Boolean(card.backItem);
                  const isPaired = hasFront && hasBack;
                  const isPsd = card.classification === 'PHOTOSHOP_TEMPLATE';
                  const needsYearReview = card.creationYear === null;

                  return (
                    <div
                      key={card.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        card.isDuplicate 
                          ? 'bg-amber-950/20 border-amber-500/40 text-amber-200' 
                          : isPaired
                            ? 'bg-slate-950/90 border-emerald-500/40 shadow-sm'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Top Bar: Card Identity & Status Badge */}
                      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800/80 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-slate-200 truncate">
                            {isPaired 
                              ? `Physical Card: ${card.baseId}` 
                              : card.frontItem?.name || card.backItem?.name}
                          </span>

                          {/* Status Badge */}
                          {card.pairingStatus === 'CONFIRMED' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9.5px] font-black uppercase flex items-center gap-1 shrink-0">
                              <CheckCircle2 className="w-3 h-3" /> Confirmed Pair (2 Sides)
                            </span>
                          )}
                          {card.pairingStatus === 'FRONT_ONLY' && (
                            <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[9.5px] font-black uppercase shrink-0">
                              Front Only
                            </span>
                          )}
                          {card.pairingStatus === 'BACK_ONLY' && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9.5px] font-black uppercase shrink-0">
                              Back Only
                            </span>
                          )}
                          {card.pairingStatus === 'AMBIGUOUS' && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9.5px] font-black uppercase flex items-center gap-1 shrink-0">
                              <AlertTriangle className="w-3 h-3" /> Ambiguous Match
                            </span>
                          )}
                          {card.pairingStatus === 'UNKNOWN_SIDE' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9.5px] font-black uppercase flex items-center gap-1 shrink-0">
                              <HelpCircle className="w-3 h-3" /> Side Unknown
                            </span>
                          )}
                        </div>

                        {/* Top Right Quick Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isPaired && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSwapSides(card.id)}
                                title="Swap Front and Back scans"
                                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 text-[10px] font-bold flex items-center gap-1 transition-colors"
                              >
                                <ArrowLeftRight className="w-3 h-3" />
                                <span>Swap Sides</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleUnpair(card.id)}
                                title="Unpair into two separate single-sided cards"
                                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold flex items-center gap-1 transition-colors"
                              >
                                <Scissors className="w-3 h-3" />
                                <span>Unpair</span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveCard(card.id)}
                            title="Remove card from batch"
                            className="p-1 rounded-lg bg-slate-900 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Main Dual Viewport: Front Scan & Back Scan */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* FRONT SCAN VIEW */}
                        <div className={`p-2.5 rounded-xl border flex items-center gap-3 ${
                          hasFront ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-950/40 border-dashed border-slate-800'
                        }`}>
                          {hasFront ? (
                            <>
                              <div className="w-14 h-18 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                                {card.frontItem?.previewUrl ? (
                                  <img src={card.frontItem.previewUrl} alt={card.frontItem.name} className="w-full h-full object-cover" />
                                ) : isPsd ? (
                                  <FileCode className="w-6 h-6 text-sky-400" />
                                ) : (
                                  <FileText className="w-6 h-6 text-slate-500" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1 text-xs">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-500/40 text-[8.5px] font-black uppercase font-mono">
                                    FRONT
                                  </span>
                                  <span className="font-bold text-slate-200 truncate block" title={card.frontItem?.name}>
                                    {card.frontItem?.name}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-1 flex flex-wrap gap-1.5">
                                  <span>{formatFileSize(card.frontItem?.size || 0)}</span>
                                  <span>·</span>
                                  <span>SHA: {card.frontItem?.checksum.slice(0, 8)}...</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="w-full text-center py-3 text-slate-500 text-[11px] italic">
                              No Front scan attached
                            </div>
                          )}
                        </div>

                        {/* BACK SCAN VIEW */}
                        <div className={`p-2.5 rounded-xl border flex items-center gap-3 ${
                          hasBack ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-950/40 border-dashed border-slate-800'
                        }`}>
                          {hasBack ? (
                            <>
                              <div className="w-14 h-18 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                                {card.backItem?.previewUrl ? (
                                  <img src={card.backItem.previewUrl} alt={card.backItem.name} className="w-full h-full object-cover" />
                                ) : isPsd ? (
                                  <FileCode className="w-6 h-6 text-sky-400" />
                                ) : (
                                  <FileText className="w-6 h-6 text-slate-500" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1 text-xs">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-500/40 text-[8.5px] font-black uppercase font-mono">
                                    BACK
                                  </span>
                                  <span className="font-bold text-slate-200 truncate block" title={card.backItem?.name}>
                                    {card.backItem?.name}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-1 flex flex-wrap gap-1.5">
                                  <span>{formatFileSize(card.backItem?.size || 0)}</span>
                                  <span>·</span>
                                  <span>SHA: {card.backItem?.checksum.slice(0, 8)}...</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="w-full flex flex-col items-center justify-center py-2 text-slate-500 text-[11px] italic">
                              <span>No Back scan attached</span>
                              {unpairedCandidates.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setPairingTargetId(pairingTargetId === card.id ? null : card.id)}
                                  className="mt-1 text-[10px] text-amber-400 hover:text-amber-300 font-bold inline-flex items-center gap-1 underline"
                                >
                                  <Link2 className="w-3 h-3" /> Pair with unassigned scan
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Manual Pair Selection Dropdown (if toggled) */}
                      {pairingTargetId === card.id && (
                        <div className="mt-2.5 p-2 rounded-xl bg-slate-900 border border-amber-500/40 text-xs">
                          <span className="text-[10px] font-bold text-amber-300 block mb-1">
                            Select an unassigned scan from this batch to link as Back:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {unpairedCandidates
                              .filter(cand => cand.id !== card.id)
                              .map(cand => {
                                const name = cand.frontItem?.name || cand.backItem?.name || cand.baseId;
                                return (
                                  <button
                                    key={cand.id}
                                    type="button"
                                    onClick={() => handleManualPair(card.id, cand.id)}
                                    className="px-2 py-1 rounded bg-slate-950 hover:bg-amber-500 hover:text-slate-950 border border-slate-700 text-[10px] font-mono transition-colors"
                                  >
                                    + {name}
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Metadata Controls Bar: Year, Classification & Side Selector */}
                      <div className="mt-3 pt-2.5 border-t border-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Year Input */}
                          <div className="flex items-center gap-1.5">
                            <label className="text-[9px] font-mono uppercase text-slate-400">Year:</label>
                            <input
                              type="number"
                              placeholder="YYYY"
                              value={card.creationYear ?? ''}
                              onChange={(e) => handleUpdateYear(card.id, e.target.value)}
                              className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-xs text-center font-mono text-slate-200"
                              min="1950"
                              max="2050"
                            />
                            {needsYearReview && (
                              <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5">
                                <AlertTriangle className="w-3 h-3" /> Set Year
                              </span>
                            )}
                          </div>

                          {/* Classification Dropdown */}
                          <div className="flex items-center gap-1.5">
                            <label className="text-[9px] font-mono uppercase text-slate-400">Class:</label>
                            <select
                              value={card.classification}
                              onChange={(e) => handleUpdateClassification(card.id, e.target.value as ArchiveClassification)}
                              className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-[11px] text-slate-200"
                            >
                              <option value="CARD_ARTWORK">Card Artwork (Scan)</option>
                              <option value="PHOTOSHOP_TEMPLATE">PSD Template</option>
                              <option value="OTHER_ASSET">Other Asset</option>
                            </select>
                          </div>

                          {/* Side Classifier for Single Scans */}
                          {!isPaired && (
                            <div className="flex items-center gap-1.5">
                              <label className="text-[9px] font-mono uppercase text-slate-400">Side:</label>
                              <select
                                value={hasFront ? (card.pairingStatus === 'UNKNOWN_SIDE' ? 'UNKNOWN' : 'FRONT') : 'BACK'}
                                onChange={(e) => handleSetSingleSide(card.id, e.target.value as CardAssetSide)}
                                className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-[11px] text-slate-200 font-mono"
                              >
                                <option value="FRONT">FRONT</option>
                                <option value="BACK">BACK</option>
                                <option value="UNKNOWN">UNKNOWN</option>
                              </select>
                            </div>
                          )}
                        </div>

                        {/* AI Scan Analysis Button */}
                        <div className="flex items-center gap-2">
                          {card.classification === 'CARD_ARTWORK' && (
                            <button
                              type="button"
                              onClick={() => handleRunAiAnalysis(card)}
                              disabled={aiAnalyzingId === card.id}
                              title="Analyze scan with AI to detect year and details"
                              className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 text-[10px] font-bold flex items-center gap-1 transition-colors"
                            >
                              <Sparkles className={`w-3 h-3 ${aiAnalyzingId === card.id ? 'animate-spin' : ''}`} />
                              <span>AI Suggest</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Duplicate Warning */}
                      {card.isDuplicate && (
                        <div className="mt-2 text-[10px] font-bold text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{card.duplicateReason || 'Duplicate of existing archive record'}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: IMPORT PROGRESS */}
          {step === 4 && (
            <div className="p-10 flex flex-col items-center justify-center space-y-6 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center animate-spin">
                <RefreshCw className="w-8 h-8 text-amber-400" />
              </div>

              <div>
                <h3 className="text-xl font-black text-slate-100">Archiving Physical Cards...</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Writing unaltered original front and back scans and generating secure derived thumbnails in IndexedDB.
                </p>
              </div>

              <div className="w-full max-w-md bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700">
                <div 
                  className="bg-gradient-to-r from-amber-500 to-amber-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <span className="text-xs font-mono text-amber-400 font-bold">{importProgress}% Complete</span>
            </div>
          )}

          {/* STEP 5: IMPORT COMPLETE & SUMMARY */}
          {step === 5 && (
            <div className="p-8 flex flex-col items-center justify-center space-y-6 text-center overflow-y-auto">
              <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center ${
                failedItems.length > 0 
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400' 
                  : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              }`}>
                {failedItems.length > 0 ? (
                  <AlertTriangle className="w-8 h-8" />
                ) : (
                  <CheckCircle2 className="w-8 h-8" />
                )}
              </div>

              <div>
                <h3 className="text-2xl font-black text-slate-100">
                  {failedItems.length > 0 ? 'Batch Import Completed with Warnings' : 'Physical Cards Saved to Archive'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {completedItems.length} physical card records ({completedItems.filter(i => i.isPaired).length} two-sided pairs) preserved permanently in your IndexedDB archive.
                  {failedItems.length > 0 && ` ${failedItems.length} items could not be saved.`}
                </p>
              </div>

              {/* Errors list if any */}
              {failedItems.length > 0 && (
                <div className="w-full max-w-md bg-rose-950/40 border border-rose-500/40 rounded-xl p-3 text-left space-y-1.5 text-xs text-rose-300">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span>Failed Items ({failedItems.length}):</span>
                  </div>
                  {failedItems.map(f => (
                    <div key={f.id} className="text-[11px] truncate">
                      • <span className="font-bold">{f.name}:</span> {f.error}
                    </div>
                  ))}
                </div>
              )}

              {/* List of imported items */}
              {completedItems.length > 0 && (
                <div className="w-full max-w-md bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2 max-h-48 overflow-y-auto text-left">
                  {completedItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="font-bold text-slate-200 truncate">{item.name}</div>
                        <div className="text-[9.5px] text-slate-400 font-mono mt-0.5">
                          {item.isPaired ? 'Two-Sided Card (Front & Back)' : 'Single-Sided Card'}
                        </div>
                      </div>
                      {onCreatePlayableFromId && (
                        <button
                          onClick={() => {
                            handleClose();
                            onCreatePlayableFromId(item.archiveId);
                          }}
                          className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 text-amber-300 text-[10px] font-bold border border-amber-500/40 transition-colors shrink-0"
                        >
                          + Playable Card
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-colors shadow-lg"
                >
                  View Archive Collection
                </button>
              </div>
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
            {step === 3 && (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700"
                  >
                    Add More Files
                  </button>

                  <button
                    onClick={handleExecuteImport}
                    disabled={stagedCards.length === 0 || !storageStatus.isPersistent}
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors shadow-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span>Import {stagedCards.filter(c => !c.isDuplicate).length} Cards</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {step === 1 && (
              <button
                onClick={handleClose}
                className="ml-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Google Drive Setup Guide Modal */}
      <GoogleDriveSetupModal
        isOpen={driveSetupOpen}
        onClose={() => setDriveSetupOpen(false)}
      />
    </>
  );
};
