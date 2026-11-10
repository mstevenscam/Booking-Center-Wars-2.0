/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * 5-Step Physical Card Import Modal (Milestone 4B Hardened)
 * 
 * Features:
 * - STEP 1: Choose Source (Google Drive or Local Upload)
 * - Support for Local Folder selection (webkitdirectory) and multi-file selection.
 * - Deep recursive drag-and-drop directory traversal preserving relative folder paths.
 * - Preservation of folder hierarchies (e.g. "2021/Tech_Bench").
 * - Pre-import storage validation: fails safely with user-visible alert if IndexedDB is unavailable.
 * - STEP 3: Review Batch with classification dropdowns, year indicators (manual review badge if missing), and duplicate warnings.
 * - STEP 4: Real-time atomic import execution without false reporting.
 * - STEP 5: Complete summary showing both succeeded and failed items with actionable feedback.
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
  FolderTree
} from 'lucide-react';
import { ImportBatchItem, ArchiveClassification, ArchiveSourceProvider, StorageStatus } from './types';
import { 
  calculateFileChecksum, 
  classifyFile, 
  extractYearFromFilename, 
  generateStableArchiveId, 
  generateThumbnail, 
  formatFileSize 
} from './utils';
import { archiveStorage } from './storage';
import { googleDriveService } from './googleDriveService';
import { aiMetadataService } from './aiMetadataService';
import { GoogleDriveSetupModal } from './GoogleDriveSetupModal';

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
  const [batchItems, setBatchItems] = useState<ImportBatchItem[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [completedItems, setCompletedItems] = useState<{ id: string; name: string; archiveId: string }[]>([]);
  const [failedItems, setFailedItems] = useState<{ id: string; name: string; error: string }[]>([]);
  const [driveSetupOpen, setDriveSetupOpen] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveError, setDriveError] = useState<{ title: string; message: string; type: 'AUTH' | 'PERMISSION' | 'DOWNLOAD' | 'CONFIG' | 'MALFORMED' | 'GENERAL' } | null>(null);
  const [driveProgress, setDriveProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [driveNotice, setDriveNotice] = useState<string | null>(null);
  const [aiAnalyzingId, setAiAnalyzingId] = useState<string | null>(null);
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

  // Reset modal state
  const handleReset = () => {
    setStep(1);
    setBatchItems([]);
    setIsProcessingFiles(false);
    setIsImporting(false);
    setImportProgress(0);
    setCompletedItems([]);
    setFailedItems([]);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  /**
   * Processes an array of files with their associated relative paths.
   */
  const processFilesWithPaths = async (
    files: { file: File | Blob; relativePath?: string; folderPath?: string }[],
    provider: ArchiveSourceProvider = 'LOCAL_UPLOAD'
  ) => {
    setIsProcessingFiles(true);
    const newItems: ImportBatchItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      const file = item.file;
      const fileName = file instanceof File ? file.name : `scan-${i}.jpg`;
      const fileType = file.type || 'application/octet-stream';
      const fileSize = file.size;

      // Extract folder hierarchy from relative path
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

      newItems.push({
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

    setBatchItems(prev => [...prev, ...newItems]);
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
      const newItems: ImportBatchItem[] = [];
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
          const checksum = await calculateFileChecksum(blob);
          const classification = classifyFile(driveItem.name, driveItem.mimeType);
          const creationYear = extractYearFromFilename(driveItem.name, driveItem.folderPath);
          const dupCheck = await archiveStorage.checkDuplicate(checksum, driveItem.id);

          let previewUrl: string | null = null;
          if (classification === 'CARD_ARTWORK') {
            previewUrl = URL.createObjectURL(blob);
          }

          newItems.push({
            id: `drive-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
            file: blob,
            name: driveItem.name,
            type: driveItem.mimeType,
            size: driveItem.size || blob.size,
            checksum,
            creationYear,
            sourceFolderPath: driveItem.folderPath || null,
            sourceDriveFileId: driveItem.id,
            sourceProvider: 'GOOGLE_DRIVE',
            classification,
            previewUrl,
            isDuplicate: dupCheck.isDuplicate,
            duplicateReason: dupCheck.reason,
            matchedArchiveId: dupCheck.matchedRecord?.archiveId,
            status: 'PENDING',
          });
        } catch (itemErr: any) {
          downloadFailures.push({
            name: driveItem.name,
            error: itemErr.message || 'Download failed',
          });
        }
      }

      if (newItems.length > 0) {
        setSourceProvider('GOOGLE_DRIVE');
        setBatchItems(prev => [...prev, ...newItems]);
        setDriveProgress(null);
        setIsProcessingFiles(false);
        setStep(3); // Advance to Step 3: Review Batch

        if (downloadFailures.length > 0) {
          setDriveError({
            title: 'Partial Download Failure',
            message: `${downloadFailures.length} of ${pickedFiles.length} file(s) failed to download: ${downloadFailures.map(f => `${f.name} (${f.error})`).join(', ')}. Successfully staged ${newItems.length} card(s).`,
            type: 'DOWNLOAD',
          });
        }
      } else {
        // Every selected file failed to download
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

  // Remove item from batch
  const handleRemoveItem = (id: string) => {
    setBatchItems(prev => {
      const target = prev.find(item => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter(item => item.id !== id);
    });
  };

  // Update classification for an item
  const handleUpdateClassification = (id: string, classification: ArchiveClassification) => {
    setBatchItems(prev => prev.map(item => item.id === id ? { ...item, classification } : item));
  };

  // Update year for an item
  const handleUpdateYear = (id: string, yearStr: string) => {
    const year = parseInt(yearStr, 10);
    setBatchItems(prev => prev.map(item => item.id === id ? { 
      ...item, 
      creationYear: !isNaN(year) && year >= 1950 && year <= 2050 ? year : null 
    } : item));
  };

  // Optional AI scan helper
  const handleRunAiAnalysis = async (item: ImportBatchItem) => {
    if (item.classification !== 'CARD_ARTWORK') return;
    setAiAnalyzingId(item.id);

    try {
      const suggestion = await aiMetadataService.analyzeCardScan(item.file, item.name);
      if (suggestion) {
        setBatchItems(prev => prev.map(i => {
          if (i.id === item.id) {
            return {
              ...i,
              creationYear: suggestion.detectedYear ?? i.creationYear,
            };
          }
          return i;
        }));
      }
    } finally {
      setAiAnalyzingId(null);
    }
  };

  // Execute Batch Import into IndexedDB
  const handleExecuteImport = async () => {
    // Fail-safe check: persistent storage MUST be available
    if (!storageStatus.isPersistent) {
      alert(
        `Cannot execute permanent archive import:\n${storageStatus.error || 'Persistent browser storage (IndexedDB) is blocked or unavailable in this session.'}`
      );
      return;
    }

    setIsImporting(true);
    setStep(4);
    setImportProgress(0);

    const successful: { id: string; name: string; archiveId: string }[] = [];
    const failed: { id: string; name: string; error: string }[] = [];
    const validItems = batchItems.filter(item => !item.isDuplicate);

    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      try {
        const archiveId = generateStableArchiveId(item.checksum, item.name, item.creationYear);
        const thumbBlob = item.classification === 'CARD_ARTWORK' 
          ? await generateThumbnail(item.file) 
          : null;

        await archiveStorage.saveArchiveRecord({
          archiveId,
          originalFileName: item.name,
          originalFileType: item.type,
          originalFileSize: item.size,
          originalFileChecksum: item.checksum,
          originalCreationYear: item.creationYear,
          sourceProvider: item.sourceProvider,
          sourceFolderPath: item.sourceFolderPath,
          sourceDriveFileId: item.sourceDriveFileId,
          importedAt: new Date().toISOString(),
          classification: item.classification,
          userNotes: null,
          derivedThumbnailId: thumbBlob ? `thumb-${archiveId}` : null,
        }, item.file, thumbBlob);

        successful.push({ id: item.id, name: item.name, archiveId });
        item.status = 'SUCCESS';
      } catch (err: any) {
        console.error(`Failed to import ${item.name}:`, err);
        item.status = 'ERROR';
        item.error = err?.message || 'Storage write failed';
        failed.push({ id: item.id, name: item.name, error: item.error! });
      }

      setImportProgress(Math.round(((i + 1) / validItems.length) * 100));
    }

    setCompletedItems(successful);
    setFailedItems(failed);
    setIsImporting(false);
    setStep(5);
    onImportComplete();
  };

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
                  {step === 3 && 'Review Batch Metadata'}
                  {step === 4 && 'Saving to Archive...'}
                  {step === 5 && 'Import Summary'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-100 mt-1">
                {step === 1 && 'Card Archive & Import Centre'}
                {step === 3 && `Review Batch (${batchItems.length} files selected)`}
                {step === 4 && 'Archiving Original Scans...'}
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

          {/* Fail-Safe Storage Warning Banner (Surfaced if IndexedDB is blocked) */}
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
                Files are cryptographically verified with SHA-256 and stored in their unaltered original binary state.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Method A: Local Computer (with Folder & Multi-File Support) */}
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
                      Select entire year-organized folders or individual files. Relative subfolder paths (e.g. <code>2021/Tech_Dept</code>) are preserved automatically.
                    </p>
                    <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                      <span>Supports: JPG · PNG · WEBP · TIFF · PSD</span>
                    </div>
                  </div>

                  {/* Dual Selection Buttons */}
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

                  {/* Hidden inputs */}
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
                      Connect your Google Drive card repository. Browse year folders or select scans with Google Picker. Original Drive IDs are preserved.
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
                  <strong>Data Safety Contract:</strong> Files are stored locally in your browser’s IndexedDB. Original scans and Photoshop templates are never modified, re-compressed, or altered.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW BATCH */}
          {step === 3 && (
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                <span>Review filenames, folder paths, creation years, and classifications before committing.</span>
                <span className="font-mono text-amber-400 font-bold">{batchItems.length} total items</span>
              </div>

              {/* Items Table */}
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                {batchItems.map((item) => {
                  const isImage = item.classification === 'CARD_ARTWORK';
                  const isPsd = item.classification === 'PHOTOSHOP_TEMPLATE';
                  const needsYearReview = item.creationYear === null;

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        item.isDuplicate 
                          ? 'bg-amber-950/20 border-amber-500/40 text-amber-200' 
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Left: Thumbnail & File Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-12 h-16 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                          {item.previewUrl ? (
                            <img src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
                          ) : isPsd ? (
                            <div className="flex flex-col items-center justify-center text-sky-400">
                              <FileCode className="w-5 h-5" />
                              <span className="text-[7.5px] font-black uppercase mt-0.5">PSD</span>
                            </div>
                          ) : (
                            <FileText className="w-5 h-5 text-slate-500" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-100 truncate" title={item.name}>
                            {item.name}
                          </div>
                          <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5 font-mono">
                            <span>{formatFileSize(item.size)}</span>
                            <span>·</span>
                            <span>SHA: {item.checksum.slice(0, 8)}...</span>
                            {item.sourceFolderPath && (
                              <>
                                <span>·</span>
                                <span className="text-sky-300 font-semibold truncate max-w-[160px]" title={item.sourceFolderPath}>
                                  📁 {item.sourceFolderPath}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Year Review Needed Flag */}
                          {needsYearReview && (
                            <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-400">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>Year not detected — please review/set year</span>
                            </div>
                          )}

                          {/* Duplicate Warning */}
                          {item.isDuplicate && (
                            <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-400">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>{item.duplicateReason}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Year, Classification & Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Year input */}
                        <div className="flex flex-col">
                          <label className="text-[8px] font-mono uppercase text-slate-500">Year</label>
                          <input
                            type="number"
                            placeholder="YYYY"
                            value={item.creationYear ?? ''}
                            onChange={(e) => handleUpdateYear(item.id, e.target.value)}
                            className="w-16 px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-center font-mono text-slate-200"
                            min="1950"
                            max="2050"
                          />
                        </div>

                        {/* Classification Dropdown */}
                        <div className="flex flex-col">
                          <label className="text-[8px] font-mono uppercase text-slate-500">Classification</label>
                          <select
                            value={item.classification}
                            onChange={(e) => handleUpdateClassification(item.id, e.target.value as ArchiveClassification)}
                            className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-[11px] text-slate-200"
                          >
                            <option value="CARD_ARTWORK">Card Artwork (Scan)</option>
                            <option value="PHOTOSHOP_TEMPLATE">PSD Template</option>
                            <option value="OTHER_ASSET">Other Asset</option>
                          </select>
                        </div>

                        {/* Optional AI Metadata Extraction button */}
                        {isImage && (
                          <button
                            type="button"
                            onClick={() => handleRunAiAnalysis(item)}
                            disabled={aiAnalyzingId === item.id}
                            title="Analyze scan with AI to suggest title and year"
                            className="mt-3 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition-colors"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${aiAnalyzingId === item.id ? 'animate-spin' : ''}`} />
                          </button>
                        )}

                        {/* Remove Action */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          title="Remove from batch"
                          className="mt-3 p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
                  Writing unaltered original scans and generating secure derived thumbnails in IndexedDB.
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
                  {completedItems.length} card assets preserved permanently in your IndexedDB archive.
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
                    <div key={item.id} className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="font-bold text-slate-200 truncate flex-1">{item.name}</span>
                      {onCreatePlayableFromId && (
                        <button
                          onClick={() => {
                            handleClose();
                            onCreatePlayableFromId(item.archiveId);
                          }}
                          className="ml-2 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 text-amber-300 text-[10px] font-bold border border-amber-500/40 transition-colors shrink-0"
                        >
                          Create Playable Card
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
                    disabled={batchItems.length === 0 || !storageStatus.isPersistent}
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors shadow-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span>Import {batchItems.filter(i => !i.isDuplicate).length} Cards</span>
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
